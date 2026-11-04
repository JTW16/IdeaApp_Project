import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface Db {
  kind: 'postgres' | 'pglite';
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * DATABASE_URL이 있으면 PostgreSQL(Supabase 등 관리형 DB), 없으면 PGlite(내장 PostgreSQL, 개발 · 시연용).
 * pgliteDir에 'memory://'를 넣으면 메모리에서만 동작한다 (테스트).
 */
export async function openDb(opts: { databaseUrl?: string; pgliteDir?: string; sslCa?: string }): Promise<Db> {
  if (opts.databaseUrl) {
    // 주소에 sslmode가 있으면 node-postgres가 아래 ssl 설정을 덮어써서 Supabase 인증서 검증에 실패한다 → 빼고 직접 정한다
    const url = new URL(opts.databaseUrl);
    for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(k);
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    // 인터넷 너머의 DB는 항상 암호화. 인증서 파일(DATABASE_SSL_CA)이 있으면 서버까지 검증하고,
    // 없으면 Supabase 문서의 sslmode=require와 같이 암호화만 한다.
    const ssl = local ? false : opts.sslCa ? { ca: await readFile(opts.sslCa, 'utf8') } : { rejectUnauthorized: false };
    // Supabase 무료 플랜의 공유 풀러는 동시 연결 수가 적다
    const pool = new pg.Pool({ connectionString: url.toString(), ssl, max: 5, idleTimeoutMillis: 30_000 });
    // 풀러가 쉬고 있는 연결을 끊으면 여기로 온다. 처리하지 않으면 서버 전체가 죽는다 (다음 요청 때 새로 연결됨)
    pool.on('error', (e) => console.warn(`DB 연결이 끊겼습니다 (다음 요청 때 다시 연결): ${e.message}`));
    return {
      kind: 'postgres',
      query: async (sql, params) => ({ rows: (await pool.query(sql, params as any[])).rows }),
      exec: async (sql) => { await pool.query(sql); },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const dir = opts.pgliteDir || './.data/pglite';
  if (!dir.startsWith('memory://')) await mkdir(dir, { recursive: true });
  const db = new PGlite(dir.startsWith('memory://') ? { extensions: { vector } } : { dataDir: dir, extensions: { vector } });
  await db.waitReady;
  return {
    kind: 'pglite',
    query: async (sql, params) => ({ rows: (await db.query(sql, params as any[])).rows as any[] }),
    exec: async (sql) => { await db.exec(sql); },
    close: () => db.close(),
  };
}

export async function migrate(db: Db) {
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await db.exec(sql);
}

/** 서로 참조하는 순서대로 (참조되는 테이블이 먼저) */
const TABLES = ['meta', 'anon_users', 'categories', 'words', 'category_words', 'ideas', 'recipes', 'posts', 'reactions', 'embed_cache'];
const SERIAL_TABLES = ['categories', 'words', 'ideas', 'posts'];

/**
 * 한 DB의 모든 데이터를 다른 DB로 옮긴다 (예: 내장 PGlite → Supabase). 번호(id)와 단어 벡터도 그대로라
 * 이미 계산한 벡터 · 만든 아이디어 · 피드를 다시 만들 필요가 없다. 받는 쪽은 비어 있어야 한다.
 */
export async function copyAll(src: Db, dst: Db, log: (m: string) => void = console.log) {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = (await src.query(`SELECT * FROM ${t}`)).rows;
    // 행들을 JSON 하나로 보내 한 번에 넣는다 (벡터 · 배열 · jsonb도 각 열의 형식으로 바뀜)
    for (let i = 0; i < rows.length; i += 200) {
      await dst.query(`INSERT INTO ${t} SELECT * FROM json_populate_recordset(NULL::${t}, $1::json)`, [JSON.stringify(rows.slice(i, i + 200))]);
    }
    counts[t] = rows.length;
    log(`  ${t}: ${rows.length}행`);
  }
  // 번호를 그대로 옮겼으므로 다음 번호가 이어지게 맞춘다
  for (const t of SERIAL_TABLES) {
    await dst.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT max(id) FROM ${t}), 1), (SELECT max(id) FROM ${t}) IS NOT NULL)`);
  }
  return counts;
}

/** 모든 데이터를 지운다 (복사 전에 받는 쪽을 비울 때) */
export async function clearAll(db: Db) {
  await db.exec(`TRUNCATE ${[...TABLES].reverse().join(', ')} RESTART IDENTITY CASCADE`);
}

/** pgvector 파라미터 문자열 */
export const vecParam = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`;
