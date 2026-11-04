import { config } from './config.js';
import { openDb, migrate } from './db.js';
import { createAi } from './ai.js';
import { seedWords, ensureEmbeddings } from './seed.js';
import { buildApp } from './app.js';

const db = await openDb({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir, sslCa: config.databaseSslCa });
await migrate(db);
const ai = createAi(config);
await seedWords(db);

if (config.jwtSecret === 'dev-only-secret-change-me' && process.env.NODE_ENV === 'production') {
  console.error('JWT_SECRET을 설정해야 배포할 수 있습니다.');
  process.exit(1);
}

const app = await buildApp({ config, db, ai });
await app.listen({ port: config.port, host: config.host });
console.log(`\n아이디어 보조 어플 서버: http://localhost:${config.port}`);
console.log(`DB: ${db.kind === 'pglite' ? `내장 PostgreSQL (PGlite, ${config.pgliteDir})` : `외부 PostgreSQL (${new URL(config.databaseUrl).hostname})`} · AI: ${ai.name === 'mock' ? '예시 모드 (GEMINI_API_KEY 없음)' : `Gemini ${config.gemini.model}`}\n`);

// 단어 벡터는 백그라운드에서 계산한다 (무료 한도 때문에 Gemini는 몇 분 걸림). 실패하면 2분 뒤 다시.
const embedLoop = async () => {
  try {
    await ensureEmbeddings(db, ai, (m) => console.log(m));
  } catch (e: any) {
    console.warn(`벡터 계산 실패, 2분 뒤 다시 시도: ${e?.message ?? e}`);
    setTimeout(embedLoop, 120_000);
  }
};
embedLoop();

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
