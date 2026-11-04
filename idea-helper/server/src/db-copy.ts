// 내장 DB(PGlite, .data/pglite)의 데이터를 DATABASE_URL의 DB(Supabase 등)로 옮긴다. 서버를 끈 상태에서 실행:
//   npm run db:copy             받는 DB가 비어 있을 때만 옮긴다
//   npm run db:copy -- --replace 받는 DB의 데이터를 모두 지우고 옮긴다
import { config } from './config.js';
import { clearAll, copyAll, migrate, openDb } from './db.js';

const replace = process.argv.includes('--replace');

if (!config.databaseUrl) {
  console.error('server/.env에 DATABASE_URL(옮겨 갈 DB 주소)을 먼저 넣어 주세요.');
  process.exit(1);
}
// 서버가 켜져 있으면 내장 DB를 열 수 없고, 받는 DB에도 동시에 쓰게 된다
const running = await fetch(`http://localhost:${config.port}/health`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
if (running) {
  console.error(`서버가 켜져 있습니다 (포트 ${config.port}). 서버를 끈 뒤 다시 실행해 주세요.`);
  process.exit(1);
}

const host = new URL(config.databaseUrl).hostname;
const src = await openDb({ pgliteDir: config.pgliteDir });
const dst = await openDb({ databaseUrl: config.databaseUrl, sslCa: config.databaseSslCa });
try {
  await migrate(dst);
  const existing = (await dst.query<{ n: number }>('SELECT count(*)::int AS n FROM categories')).rows[0].n;
  if (existing > 0) {
    if (!replace) {
      console.error(`받는 DB(${host})에 이미 데이터가 있습니다. 지우고 옮기려면: npm run db:copy -- --replace`);
      process.exit(1);
    }
    console.log(`받는 DB(${host})의 기존 데이터를 지웁니다`);
    await clearAll(dst);
  }
  console.log(`${config.pgliteDir} → ${host} 복사 시작`);
  const counts = await copyAll(src, dst);
  const check = (await dst.query<{ words: number; vec: number }>('SELECT count(*)::int AS words, count(vec)::int AS vec FROM words')).rows[0];
  console.log(`\n복사 완료: 단어 ${check.words}개(벡터 ${check.vec}개), 아이디어 ${counts.ideas}개, 피드 · 링크 글 ${counts.posts}개`);
  console.log('이제 서버를 켜면(npm run dev) 이 DB를 씁니다. 새로 추가된 단어의 벡터는 서버가 백그라운드에서 계산합니다.');
} finally {
  await src.close();
  await dst.close();
}
