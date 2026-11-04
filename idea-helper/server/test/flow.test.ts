// 핵심 사용자 흐름과 기획서 목표(특히 목표 4: 같은 조합은 AI 호출 0회)를 검사한다.
process.env.NODE_ENV = 'test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { openDb, migrate, type Db } from '../src/db.js';
import { createMock } from '../src/ai.js';
import { ensureEmbeddings, seedWords } from '../src/seed.js';
import { buildApp } from '../src/app.js';
import { DEFAULT_CATEGORIES } from '../src/seed-words.js';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const ai = createMock(config.embedDim);

const call = async (method: string, url: string, token?: string, body?: unknown) => {
  const res = await app.inject({
    method: method as any,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body as any } : {}),
  });
  return { status: res.statusCode, body: res.headers['content-type']?.toString().includes('json') ? res.json() : res.body };
};
const login = async (deviceId: string) => (await call('POST', '/auth/anonymous', undefined, { deviceId })).body;

before(async () => {
  db = await openDb({ pgliteDir: 'memory://' });
  await migrate(db);
  await seedWords(db, () => {});
  await ensureEmbeddings(db, ai, () => {});
  app = await buildApp({ config: { ...config, matchMaxDistance: null }, db, ai });
});
after(async () => {
  await app.close();
  await db.close();
});

test('기본 카테고리마다 단어 100개 이상 (비기능 요구사항)', async () => {
  for (const c of DEFAULT_CATEGORIES) assert.ok(c.words.length >= 100, c.name);
  const r = await db.query('SELECT c.name, count(*)::int AS n FROM category_words cw JOIN categories c ON c.id = cw.category_id GROUP BY c.name');
  for (const row of r.rows) assert.ok(row.n >= 100, `${row.name}: ${row.n}`);
});

test('토큰 없이는 요청할 수 없다', async () => {
  assert.equal((await call('GET', '/categories')).status, 401);
});

test('익명 로그인은 같은 기기면 같은 ID', async () => {
  const a = await login('device-aaaa-1111');
  const b = await login('device-aaaa-1111');
  assert.equal(a.userId, b.userId);
  assert.equal(a.nickname, b.nickname);
  assert.ok(a.token);
});

test('핵심 흐름: 카테고리 → 단어 3개 → 고정 후 다시 뽑기 → 창조 → 같은 조합은 DB에서', async () => {
  const { token } = await login('device-flow-0001');
  const cats = (await call('GET', '/categories', token)).body;
  assert.equal(cats.defaults.length, 3);
  const food = cats.defaults.find((c: any) => c.name === '음식 개발');

  const first = await call('POST', '/words/draw', token, { categoryId: food.id, fixedWordIds: [] });
  assert.equal(first.status, 200);
  assert.equal(first.body.words.length, 3);
  const [w1, w2, w3] = first.body.words;

  // w1 고정, 나머지만 다시 뽑기 → 2개가 새로 나오고 고정 단어는 포함되지 않음
  const reroll = await call('POST', '/words/draw', token, { categoryId: food.id, fixedWordIds: [w1.id], excludeWordIds: [w2.id, w3.id] });
  assert.equal(reroll.body.words.length, 2);
  assert.ok(!reroll.body.words.some((w: any) => w.id === w1.id));
  assert.ok(!reroll.body.words.some((w: any) => w.id === w2.id || w.id === w3.id));

  // 고정은 최대 2개
  assert.equal((await call('POST', '/words/draw', token, { categoryId: food.id, fixedWordIds: [w1.id, w2.id, w3.id] })).status, 400);

  const before = ai.calls.idea;
  const ids = [w1.id, w2.id, w3.id];
  const made = await call('POST', '/ideas', token, { categoryId: food.id, wordIds: ids });
  assert.equal(made.status, 200);
  assert.equal(made.body.fromCache, false);
  assert.ok(made.body.idea.title);
  assert.equal(ai.calls.idea, before + 1);

  // 단어 순서만 바꿔 다시 요청 → 같은 조합, AI 호출 0회 (기획서 목표 4)
  const again = await call('POST', '/ideas', token, { categoryId: food.id, wordIds: [w3.id, w1.id, w2.id] });
  assert.equal(again.body.fromCache, true);
  assert.equal(again.body.idea.id, made.body.idea.id);
  assert.equal(ai.calls.idea, before + 1);

  // 방향성이 다르면 다른 조합
  const dir = await call('POST', '/ideas', token, { categoryId: food.id, wordIds: ids, direction: '  매콤한   요리 ' });
  assert.equal(dir.body.fromCache, false);
  assert.equal(dir.body.idea.direction, '매콤한 요리');

  // 다른 카테고리의 단어는 거절
  const prog = cats.defaults.find((c: any) => c.name === '프로그램 개발');
  assert.equal((await call('POST', '/ideas', token, { categoryId: prog.id, wordIds: ids })).status, 400);

  // 만드는 법: 처음엔 AI, 다음부터 DB
  const r1 = await call('POST', `/ideas/${made.body.idea.id}/recipe`, token);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.recipe.kind, 'food');
  assert.equal(r1.body.fromCache, false);
  const r2 = await call('POST', `/ideas/${made.body.idea.id}/recipe`, token);
  assert.equal(r2.body.fromCache, true);
});

test('방향성을 넣으면 그 카테고리 단어 중에서 뽑는다', async () => {
  const { token } = await login('device-direction-01');
  const cats = (await call('GET', '/categories', token)).body;
  const food = cats.defaults.find((c: any) => c.name === '음식 개발');
  const r = await call('POST', '/words/draw', token, { categoryId: food.id, fixedWordIds: [], direction: '튀김 요리' });
  assert.equal(r.status, 200);
  assert.equal(r.body.words.length, 3);
  assert.equal((await call('POST', '/words/draw', token, { categoryId: food.id, fixedWordIds: [], direction: '가'.repeat(51) })).status, 400);
});

test('나만의 카테고리: 미리보기 → 추가 → 중복이면 기존 카테고리 → 다른 사용자 목록에 노출', async () => {
  const { token } = await login('device-custom-001');
  const pv = await call('POST', '/categories/preview', token, { name: '캠핑 요리' });
  assert.equal(pv.status, 200);
  assert.ok(pv.body.matchedCount >= 10);
  assert.equal(pv.body.canCreate, true);

  const created = await call('POST', '/categories', token, { name: '캠핑 요리' });
  assert.equal(created.body.existed, false);
  const dup = await call('POST', '/categories', token, { name: '캠핑요리' });
  assert.equal(dup.body.existed, true);
  assert.equal(dup.body.category.id, created.body.category.id);

  const other = await login('device-custom-002');
  const cats = (await call('GET', '/categories', other.token)).body;
  assert.ok(cats.userMade.some((c: any) => c.name === '캠핑 요리'));
  const draw = await call('POST', '/words/draw', other.token, { categoryId: created.body.category.id, fixedWordIds: [] });
  assert.equal(draw.body.words.length, 3);

  assert.equal((await call('POST', '/categories', token, { name: '가' })).status, 400);
});

test('공유: 링크 복사 → 웹 페이지, 피드에 올리기 → 피드, 반응은 하나만 · 내 글에는 불가', async () => {
  const me = await login('device-share-0001');
  const you = await login('device-share-0002');
  const cats = (await call('GET', '/categories', me.token)).body;
  const cat = cats.defaults[2];
  const words = (await call('POST', '/words/draw', me.token, { categoryId: cat.id, fixedWordIds: [] })).body.words;
  const idea = (await call('POST', '/ideas', me.token, { categoryId: cat.id, wordIds: words.map((w: any) => w.id) })).body.idea;

  const link = await call('POST', '/shares', me.token, { ideaId: idea.id });
  assert.match(link.body.url, /\/s\//);
  const page = await call('GET', `/s/${link.body.shareCode}`);
  assert.equal(page.status, 200);
  assert.ok(String(page.body).includes(idea.title.replace(/[&<>"']/g, '').slice(0, 2)));
  assert.equal((await call('GET', '/s/nope')).status, 404);

  // 링크만 공유한 글은 피드에 안 보인다
  let feed = (await call('GET', '/posts?sort=latest', you.token)).body;
  assert.ok(!feed.posts.some((p: any) => p.ideaId === idea.id));

  const posted = await call('POST', '/posts', me.token, { ideaId: idea.id });
  assert.equal(posted.body.alreadyPosted, false);
  assert.equal(posted.body.post.mine, true);
  assert.equal((await call('POST', '/posts', me.token, { ideaId: idea.id })).body.alreadyPosted, true);

  feed = (await call('GET', '/posts?sort=latest', you.token)).body;
  const p = feed.posts.find((x: any) => x.ideaId === idea.id);
  assert.ok(p);
  assert.equal(p.mine, false);

  assert.equal((await call('PUT', `/posts/${p.id}/reaction`, me.token, { kind: 'like' })).status, 403);
  let r = await call('PUT', `/posts/${p.id}/reaction`, you.token, { kind: 'like' });
  assert.deepEqual(r.body.counts, { like: 1, meh: 0, dislike: 0 });
  r = await call('PUT', `/posts/${p.id}/reaction`, you.token, { kind: 'dislike' });
  assert.deepEqual(r.body.counts, { like: 0, meh: 0, dislike: 1 });
  r = await call('PUT', `/posts/${p.id}/reaction`, you.token, { kind: null });
  assert.deepEqual(r.body.counts, { like: 0, meh: 0, dislike: 0 });

  const popular = await call('GET', '/posts?sort=popular', you.token);
  assert.equal(popular.status, 200);
});
