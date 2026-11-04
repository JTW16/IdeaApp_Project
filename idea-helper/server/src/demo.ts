// 시연 준비: 테스트 · 예시 모드로 쌓인 데이터를 지우고, 실제 AI(Gemini)로 만든 피드 · 나만의 카테고리를 채운다.
// 단어와 단어 벡터는 그대로 둔다. 서버를 끈 상태에서 실행한다:  npm run demo
import { config } from './config.js';
import { openDb, migrate } from './db.js';
import { createAi } from './ai.js';
import { seedWords, ensureEmbeddings } from './seed.js';
import { buildApp } from './app.js';
import type { ReactionKind } from '../../shared/api.js';

const log = (m: string) => console.log(m);

// 내장 DB(PGlite)는 한 프로세스만 열 수 있다 → 서버가 켜져 있으면 멈춘다
const running = await fetch(`http://localhost:${config.port}/health`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
if (running) {
  console.error(`서버가 켜져 있습니다 (포트 ${config.port}). 서버를 끈 뒤 다시 실행해 주세요.`);
  process.exit(1);
}

const ai = createAi(config);
if (ai.name === 'mock') {
  console.error('GEMINI_API_KEY가 없습니다. 예시 모드 결과로 피드를 채우면 시연에 쓸 수 없어서 멈춥니다.');
  process.exit(1);
}

const db = await openDb({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir, sslCa: config.databaseSslCa });
await migrate(db);
await seedWords(db, log);
await ensureEmbeddings(db, ai, log); // 이미 계산돼 있으면 바로 넘어간다

// ---------- 1. 초기화 ----------
await db.exec(`
  DELETE FROM reactions;
  DELETE FROM posts;
  DELETE FROM recipes;
  DELETE FROM ideas;
  DELETE FROM categories WHERE kind = 'user';
  DELETE FROM anon_users;
  UPDATE categories SET use_count = 0;
  -- 터미널 인코딩 문제로 글자가 깨진 채 저장된 문장 벡터 (한글 · 영문 · 숫자 · 기본 문장부호 밖의 글자가 있는 것)
  DELETE FROM embed_cache WHERE text ~ '[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ,.!?~·()''"-]';
`);
log('초기화 완료: 아이디어 · 만드는 법 · 피드 · 반응 · 나만의 카테고리 · 익명 사용자 삭제 (단어와 벡터는 유지)');

// ---------- 2. 시연용 데이터 ----------
const app = await buildApp({
  config: { ...config, limits: { ...config.limits, aiPerMinute: 1000, categoriesPerDay: 1000, postsPerMinute: 1000, previewPerMinute: 1000 } },
  db, ai, quiet: true,
});
const call = async (method: string, url: string, token?: string, body?: unknown) => {
  const res = await app.inject({
    method: method as any, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body as any } : {}),
  });
  return { status: res.statusCode, body: res.json() as any };
};

const users: { token: string; nickname: string }[] = [];
for (let i = 1; i <= 6; i++) {
  const r = await call('POST', '/auth/anonymous', undefined, { deviceId: `demo-seed-user-${i}` });
  users.push({ token: r.body.token, nickname: r.body.nickname });
}

// 다른 사용자가 만든 카테고리
for (const [i, name] of ['캠핑 요리', '여행 앱', '카페 창업'].entries()) {
  const r = await call('POST', '/categories', users[i].token, { name });
  log(r.status === 200 ? `카테고리 '${name}' 추가 (연관 단어 ${r.body.matchedCount}개)` : `카테고리 '${name}' 실패: ${r.body.error?.message}`);
}
const cats = (await call('GET', '/categories', users[0].token)).body;
const allCats: { id: number; name: string }[] = [...cats.defaults, ...cats.userMade];

/** 단어가 그 카테고리에 있으면 그 단어로, 없으면 랜덤으로 뽑아서 아이디어를 만든다 */
async function makeIdea(user: { token: string }, catName: string, wanted: string[], direction = '') {
  const cat = allCats.find((c) => c.name === catName);
  if (!cat) return null;
  const found = await db.query<{ id: number; text: string }>(
    `SELECT w.id, w.text FROM category_words cw JOIN words w ON w.id = cw.word_id WHERE cw.category_id = $1 AND w.text = ANY($2::text[])`,
    [cat.id, wanted],
  );
  let ids = found.rows.map((w) => w.id);
  if (ids.length < 3) {
    const more = (await call('POST', '/words/draw', user.token, { categoryId: cat.id, fixedWordIds: ids.slice(0, 2), direction })).body.words ?? [];
    ids = [...ids.slice(0, 2), ...more.map((w: any) => w.id)].slice(0, 3);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await call('POST', '/ideas', user.token, { categoryId: cat.id, wordIds: ids, direction });
    if (r.status === 200) return r.body.idea as { id: number; title: string };
    log(`  아이디어 생성 실패 (${r.body.error?.code}), 다시 시도`);
  }
  return null;
}

// [작성자, 카테고리, 단어, 방향성, 몇 분 전, 반응(작성자 제외 순서대로), 만드는 법도 미리 만들지]
const plan: [number, string, string[], string, number, ReactionKind[], boolean][] = [
  [0, '음식 개발', ['떡볶이', '치즈', '캠핑'], '', 8, ['like', 'like', 'meh'], true],
  [1, '프로그램 개발', ['습관', '퀘스트', '수면'], '', 47, ['like', 'like', 'like', 'like', 'meh'], true],
  [2, '공모전 주제선정', ['전통시장', '키오스크', '노인'], '', 95, ['like', 'like', 'like'], false],
  [3, '음식 개발', ['말차', '와플', '겨울'], '', 190, ['like', 'meh', 'dislike'], true],
  [4, '캠핑 요리', [], '', 320, ['like', 'like'], false],
  [5, '공모전 주제선정', ['해양쓰레기', '업사이클링', '축제'], '', 600, ['like', 'like', 'like', 'meh'], false],
  [0, '프로그램 개발', ['도서관', '대기열', '알림'], '', 1300, ['meh', 'like'], false],
  [1, '여행 앱', [], '', 2900, ['like', 'dislike', 'meh'], false],
];

let posted = 0;
for (const [author, catName, words, direction, minutesAgo, reactions, withRecipe] of plan) {
  const idea = await makeIdea(users[author], catName, words, direction);
  if (!idea) {
    log(`[${catName}] 아이디어를 만들지 못해 건너뜀`);
    continue;
  }
  if (withRecipe) {
    const rc = await call('POST', `/ideas/${idea.id}/recipe`, users[author].token);
    if (rc.status !== 200) log(`  만드는 법 생성 실패 (${rc.body.error?.code}) — 시연 중 처음 열 때 만들어짐`);
  }
  const post = (await call('POST', '/posts', users[author].token, { ideaId: idea.id })).body.post;
  await db.query(`UPDATE posts SET created_at = now() - make_interval(mins => $2) WHERE id = $1`, [post.id, minutesAgo]);
  const others = users.filter((_, i) => i !== author);
  for (const [i, kind] of reactions.entries()) {
    await call('PUT', `/posts/${post.id}/reaction`, others[i].token, { kind });
  }
  posted++;
  log(`[${catName}] ${idea.title} — ${users[author].nickname}`);
}

// 시연 중 카테고리 목록에 '많이 쓴 순'이 자연스럽게 보이도록
await db.query(`UPDATE categories SET use_count = CASE name WHEN '캠핑 요리' THEN 12 WHEN '여행 앱' THEN 7 WHEN '카페 창업' THEN 4 ELSE use_count END WHERE kind = 'user'`);

await app.close();
await db.close();
log(`\n시연 준비 완료: 피드 글 ${posted}개, 나만의 카테고리 3개.`);
log('이제 서버를 켜고(npm run dev), 앱은 브라우저 시크릿 창에서 여세요. (예전에 저장한 기록 · 토큰이 남아 있지 않게)');
