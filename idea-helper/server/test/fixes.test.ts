// 시연 준비하며 고친 부분 검사: 음식 판별, 금칙어, 숨긴 아이디어 교체, 뜻 없는 카테고리 이름, 삭제된 사용자 토큰,
// AI 한도 초과 안내, 앱에서 취소하면 AI 호출 중단, AI 호출 / DB 재사용 집계, 04 다시 조합하기, 단어 추가 · DB 옮기기. (실제 Gemini는 부르지 않는다)
process.env.NODE_ENV = 'test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { copyAll, openDb, migrate, type Db } from '../src/db.js';
import { AiError, createMock, type AiProvider } from '../src/ai.js';
import { ensureEmbeddings, seedWords } from '../src/seed.js';
import { buildApp, hasBanned, recipeKind } from '../src/app.js';

let db: Db;
const mock = createMock(config.embedDim);
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function makeApp(ai: AiProvider = mock, overrides: Partial<typeof config> = {}) {
  const app = await buildApp({ config: { ...config, matchMaxDistance: null, ...overrides }, db, ai });
  apps.push(app);
  const call = async (method: string, url: string, token?: string, body?: unknown) => {
    const res = await app.inject({
      method: method as any, url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body !== undefined ? { payload: body as any } : {}),
    });
    return { status: res.statusCode, body: res.json() as any };
  };
  const login = async (deviceId: string) => (await call('POST', '/auth/anonymous', undefined, { deviceId })).body;
  return { app, call, login };
}

/** 카테고리에서 아직 아이디어가 없는 단어 3개 */
async function freshWords(categoryName: string) {
  const r = await db.query<{ cid: number; ids: number[] }>(
    `SELECT c.id AS cid, (array_agg(cw.word_id ORDER BY random()))[1:3] AS ids
       FROM categories c JOIN category_words cw ON cw.category_id = c.id WHERE c.name = $1 GROUP BY c.id`,
    [categoryName],
  );
  return { categoryId: r.rows[0].cid, wordIds: r.rows[0].ids };
}

before(async () => {
  db = await openDb({ pgliteDir: 'memory://' });
  await migrate(db);
  await seedWords(db, () => {});
  await ensureEmbeddings(db, mock, () => {});
});
after(async () => {
  for (const a of apps) await a.close();
  await db.close();
});

test('만드는 법 종류: 기술 · 미술 · 카페 창업은 음식이 아니다', () => {
  for (const n of ['음식 개발', '캠핑 요리', '카페 메뉴', '여름 디저트', '편의점 도시락']) assert.equal(recipeKind(n), 'food', n);
  for (const n of ['기술 창업', '미술 수업', '카페 창업', '프로그램 개발', '공모전 주제선정']) assert.equal(recipeKind(n), 'plan', n);
});

test('금칙어는 공백 · 대소문자를 무시하고 찾는다', () => {
  assert.ok(hasBanned('씨 발'));
  assert.ok(hasBanned('FUCK this'));
  assert.ok(!hasBanned('캠핑용 통치즈 떡볶이'));
});

test('숨긴 아이디어를 다시 요청하면 새로 만들고, 예전 만드는 법 · 공유 글은 지운다', async () => {
  const { call, login } = await makeApp();
  const { token } = await login('device-hidden-001');
  const { categoryId, wordIds } = await freshWords('음식 개발');
  const first = (await call('POST', '/ideas', token, { categoryId, wordIds })).body.idea;
  await call('POST', `/ideas/${first.id}/recipe`, token);
  await call('POST', '/posts', token, { ideaId: first.id });
  await db.query('UPDATE ideas SET hidden = true, report_count = 5 WHERE id = $1', [first.id]);

  const before = mock.calls.idea;
  const again = await call('POST', '/ideas', token, { categoryId, wordIds });
  assert.equal(again.status, 200);
  assert.equal(again.body.fromCache, false);
  assert.equal(again.body.idea.id, first.id); // 같은 조합 키 → 같은 행을 교체
  assert.equal(mock.calls.idea, before + 1);
  const row = (await db.query('SELECT hidden, report_count FROM ideas WHERE id = $1', [first.id])).rows[0];
  assert.deepEqual(row, { hidden: false, report_count: 0 });
  assert.equal((await db.query('SELECT 1 FROM recipes WHERE idea_id = $1', [first.id])).rows.length, 0);
  assert.equal((await db.query('SELECT 1 FROM posts WHERE idea_id = $1', [first.id])).rows.length, 0);
});

test('뜻 없는 카테고리 이름: 연관 단어의 거리 차이가 기준보다 작으면 0개로 본다', async () => {
  const strict = await makeApp(mock, { matchMinSpread: 2 }); // 코사인 거리 차이는 2를 넘을 수 없음 → 항상 거절
  const { token } = await strict.login('device-spread-001');
  const pv = await strict.call('POST', '/categories/preview', token, { name: '여름 캠핑' });
  assert.equal(pv.body.matchedCount, 0);
  assert.equal(pv.body.canCreate, false);
  assert.equal((await strict.call('POST', '/categories', token, { name: '여름 캠핑' })).status, 422);

  const loose = await makeApp(mock, { matchMinSpread: 0 });
  assert.ok((await loose.call('POST', '/categories/preview', token, { name: '여름 캠핑' })).body.matchedCount >= 10);
});

test('DB에서 지워진 사용자의 토큰은 401 (앱이 자동으로 다시 발급받음)', async () => {
  const { call, login } = await makeApp();
  const me = await login('device-deleted-01');
  assert.equal((await call('GET', '/categories', me.token)).status, 200);
  await db.query('DELETE FROM anon_users WHERE id = $1', [me.userId]);
  const r = await call('GET', '/categories', me.token);
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'UNAUTHORIZED');
  assert.equal((await call('GET', '/categories', (await login('device-deleted-01')).token)).status, 200);
});

test('AI 한도 초과는 429 + 안내 문구, 금칙어가 든 결과는 저장하지 않는다', async () => {
  const quota: AiProvider = { ...mock, generateIdea: async () => { throw new AiError('AI_QUOTA', 'test'); } };
  const q = await makeApp(quota);
  const { token } = await q.login('device-quota-001');
  const w1 = await freshWords('프로그램 개발');
  const r = await q.call('POST', '/ideas', token, w1);
  assert.equal(r.status, 429);
  assert.equal(r.body.error.code, 'AI_QUOTA');
  assert.match(r.body.error.message, /한도/);

  const rude: AiProvider = { ...mock, generateIdea: async () => ({ title: '존나 좋은 앱', content: '설명' }) };
  const b = await makeApp(rude);
  const w2 = await freshWords('프로그램 개발');
  assert.equal((await b.call('POST', '/ideas', token, w2)).status, 502);
  assert.equal((await db.query('SELECT 1 FROM ideas WHERE word_ids @> $1::int[] AND category_id = $2', [w2.wordIds, w2.categoryId])).rows.length, 0);
});

test('03에서 취소해 연결이 끊기면 AI 호출도 멈춘다', async () => {
  let sawAbort = false;
  const slow: AiProvider = {
    ...mock,
    generateIdea: (_input, signal) => new Promise((_resolve, reject) => {
      const t = setTimeout(() => reject(new Error('취소 신호가 오지 않음')), 3000);
      signal?.addEventListener('abort', () => { sawAbort = true; clearTimeout(t); reject(new AiError('AI_FAILED', '취소')); });
    }),
  };
  const { app, login } = await makeApp(slow);
  const { token } = await login('device-cancel-001');
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const ctrl = new AbortController();
  const req = fetch(`${address}/ideas`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(await freshWords('공모전 주제선정')),
    signal: ctrl.signal,
  }).catch(() => null);
  setTimeout(() => ctrl.abort(), 200);
  await req;
  for (let i = 0; i < 20 && !sawAbort; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(sawAbort);
});

test('/health에 AI로 만든 수와 DB에서 꺼낸 수가 보인다 (목표 4 확인용)', async () => {
  const { call, login } = await makeApp();
  const { token } = await login('device-stats-001');
  const w = await freshWords('음식 개발');
  await call('POST', '/ideas', token, w);
  await call('POST', '/ideas', token, { ...w, wordIds: [...w.wordIds].reverse() });
  const h = (await call('GET', '/health')).body;
  assert.deepEqual({ ai: h.stats.aiIdeas, cached: h.stats.cachedIdeas }, { ai: 1, cached: 1 });
});

test('단어 추가는 여러 번 실행해도 새 단어만 들어간다', async () => {
  const again = await seedWords(db, () => {});
  assert.deepEqual(again, { added: 0, linked: 0 });
  await db.query("DELETE FROM category_words WHERE word_id = (SELECT id FROM words WHERE text = '비빔밥')");
  await db.query("DELETE FROM words WHERE text = '비빔밥'");
  const one = await seedWords(db, () => {});
  assert.deepEqual(one, { added: 1, linked: 1 });
  // 새로 들어간 단어만 벡터가 없고, 계산하면 채워진다
  await ensureEmbeddings(db, mock, () => {});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM words WHERE vec IS NULL')).rows[0].n, 0);
});

test("04 '다시 조합하기': 같은 단어로 누를 때마다 새 아이디어 (이전 결과를 AI에 알림), '창조'의 같은 조합은 원래 결과 그대로", async () => {
  const seen: (string[] | undefined)[] = [];
  const spy: AiProvider = {
    ...mock,
    async generateIdea(input, signal) {
      seen.push(input.avoid);
      return mock.generateIdea(input, signal);
    },
  };
  const { call, login } = await makeApp(spy);
  const { token } = await login('recombine-user');
  const { categoryId, wordIds } = await freshWords('프로그램 개발');
  const first = (await call('POST', '/ideas', token, { categoryId, wordIds })).body.idea;
  const r1 = await call('POST', `/ideas/${first.id}/recombine`, token, {});
  const r2 = await call('POST', `/ideas/${r1.body.idea.id}/recombine`, token, {});
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r1.body.fromCache, false);
  assert.equal(new Set([first.id, r1.body.idea.id, r2.body.idea.id]).size, 3);
  assert.deepEqual(r2.body.idea.words.map((w: { id: number }) => w.id).sort(), [...wordIds].sort());
  // 처음 '창조'는 비교할 것이 없고, 다시 조합할 때마다 그때까지 나온 결과(최신 순)를 넘긴다
  assert.deepEqual(seen.map((a) => a?.length), [undefined, 1, 2]);
  assert.ok(seen[2]![0].startsWith(r1.body.idea.title));

  // 같은 단어로 다시 '창조' → 원래 결과를 DB에서 (AI 0회)
  const again = await call('POST', '/ideas', token, { categoryId, wordIds: [...wordIds].reverse() });
  assert.equal(again.body.fromCache, true);
  assert.equal(again.body.idea.id, first.id);
  assert.equal(seen.length, 3);

  // 다시 조합한 결과도 만드는 법 · 공유가 된다
  assert.equal((await call('POST', `/ideas/${r2.body.idea.id}/recipe`, token, {})).status, 200);
  assert.equal((await call('POST', '/shares', token, { ideaId: r2.body.idea.id })).status, 200);
  assert.equal((await call('POST', '/ideas/999999/recombine', token, {})).status, 404);
});

test('DB 옮기기(내장 → Supabase 등): 모든 행 · 번호 · 단어 벡터가 그대로, 다음 번호가 이어진다', async () => {
  const dst = await openDb({ pgliteDir: 'memory://' });
  try {
    await migrate(dst);
    const counts = await copyAll(db, dst, () => {});
    for (const t of Object.keys(counts)) {
      const n = (await dst.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
      assert.equal(n, counts[t], t);
    }
    const sample = (await db.query('SELECT id, text, vec::text AS vec FROM words ORDER BY id DESC LIMIT 1')).rows[0];
    const copied = (await dst.query('SELECT id, text, vec::text AS vec FROM words WHERE id = $1', [sample.id])).rows[0];
    assert.deepEqual(copied, sample);
    const idea = (await db.query('SELECT id, word_ids, combo_key FROM ideas ORDER BY id LIMIT 1')).rows[0];
    assert.deepEqual((await dst.query('SELECT id, word_ids, combo_key FROM ideas WHERE id = $1', [idea.id])).rows[0], idea);
    // 옮긴 뒤 새 단어를 넣으면 가장 큰 번호 다음부터
    const maxId = (await dst.query<{ m: number }>('SELECT max(id) AS m FROM words')).rows[0].m;
    const next = (await dst.query<{ id: number }>("INSERT INTO words (text) VALUES ('옮긴뒤새단어') RETURNING id")).rows[0].id;
    assert.equal(next, maxId + 1);
  } finally {
    await dst.close();
  }
});
