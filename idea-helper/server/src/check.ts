// 시연 직전 점검: 서버 · DB · 단어 벡터 · 피드 데이터 · Gemini 한도를 한 번에 확인한다.
// 서버를 켠 상태에서 실행:  npm run check   (Gemini를 실제로 1번 호출한다)
import { config } from './config.js';
import { createGemini } from './ai.js';

const B = `http://localhost:${config.port}`;
let ok = true;
const pass = (m: string) => console.log(`✅ ${m}`);
const fail = (m: string) => { ok = false; console.log(`❌ ${m}`); };

const get = async (path: string, token?: string, body?: unknown) => {
  const res = await fetch(B + path, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  return res.json() as Promise<any>;
};

try {
  const h = await get('/health');
  pass(`서버 켜짐 (${B}, DB: ${h.db === 'postgres' ? `외부 PostgreSQL${config.databaseUrl ? ` — ${new URL(config.databaseUrl).hostname}` : ''}` : '내장 PGlite'})`);
  if (h.ai === 'gemini') pass('AI: Gemini 모드');
  else fail('AI가 예시 모드입니다 — server/.env에 GEMINI_API_KEY를 넣고 서버를 다시 켜세요');
  const { done, total } = h.wordVectors;
  if (done === total) pass(`단어 벡터 ${done}/${total} 계산 완료`);
  else fail(`단어 벡터 ${done}/${total} — 아직 계산 중입니다. 서버 로그에 '벡터 계산 완료'가 나올 때까지 기다리세요 (방향성 · 나만의 카테고리용)`);

  const { token } = await get('/auth/anonymous', undefined, { deviceId: 'demo-check-device' });
  const cats = await get('/categories', token);
  pass(`카테고리: 기본 ${cats.defaults.length}개, 다른 사용자 ${cats.userMade.length}개`);
  const feed = await get('/posts?sort=latest', token);
  const mock = feed.posts.filter((p: any) => p.content.includes('예시 결과'));
  if (!feed.posts.length) fail('피드가 비어 있습니다 — 서버를 끄고 npm run demo 로 시연 데이터를 넣으세요');
  else if (mock.length) fail(`피드에 예시 모드 글이 ${mock.length}개 있습니다 — 서버를 끄고 npm run demo 로 다시 채우세요`);
  else pass(`피드 글 ${feed.posts.length}개`);
} catch {
  fail(`서버에 연결할 수 없습니다 (${B}) — server 폴더에서 npm run dev 를 먼저 실행하세요`);
}

if (config.gemini.apiKey) {
  const ai = createGemini(config.gemini, config.embedDim);
  const s = Date.now();
  try {
    const r = await ai.generateIdea({ categoryName: '음식 개발', words: ['커피', '라면', '여름'], direction: '' });
    const ms = Date.now() - s;
    (ms <= 5000 ? pass : fail)(`Gemini 응답 ${(ms / 1000).toFixed(1)}초 — "${r.title}"`);
  } catch (e: any) {
    if (e?.code === 'AI_QUOTA') fail('Gemini 사용 한도 초과 — 무료 등급은 모델당 하루 20회입니다. 결제를 연결하거나 한도가 풀릴 때까지 기다리세요');
    else fail(`Gemini 호출 실패 (${e?.code ?? 'ERROR'}) — ${String(e?.message ?? e).slice(0, 160)}`);
  }
}

console.log(ok ? '\n시연 준비 끝 👍' : '\n위 ❌ 항목을 먼저 해결하세요');
process.exit(ok ? 0 : 1);
