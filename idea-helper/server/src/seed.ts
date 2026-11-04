import type { Db } from './db.js';
import { vecParam } from './db.js';
import type { AiProvider } from './ai.js';
import { DEFAULT_CATEGORIES, GENERAL_WORDS } from './seed-words.js';

export const nameKey = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 기본 카테고리와 단어 풀을 DB에 맞춘다. 서버를 켤 때마다 실행해도 되고, `seed-words.ts`에 새로 넣은 단어만 들어간다.
 * 한 번에 넣는다(인터넷 너머의 DB라면 단어마다 한 번씩 보내면 수천 번 왕복). 벡터는 ensureEmbeddings가 따로 계산한다.
 */
export async function seedWords(db: Db, log: (m: string) => void = console.log) {
  const allWords = [...new Set([...DEFAULT_CATEGORIES.flatMap((c) => c.words), ...GENERAL_WORDS])];
  const added = await db.query<{ id: number }>(
    'INSERT INTO words (text) SELECT unnest($1::text[]) ON CONFLICT (text) DO NOTHING RETURNING id',
    [allWords],
  );
  let linked = 0;
  for (const c of DEFAULT_CATEGORIES) {
    // ON CONFLICT 대신 NOT EXISTS: 이미 있을 때 serial 번호를 헛되이 쓰지 않게
    await db.query(
      `INSERT INTO categories (name, name_key, kind) SELECT $1, $2, 'default'
        WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name_key = $2)`,
      [c.name, nameKey(c.name)],
    );
    const r = await db.query<{ word_id: number }>(
      `INSERT INTO category_words (category_id, word_id, score)
       SELECT c.id, w.id, 1 FROM categories c JOIN words w ON w.text = ANY($2::text[]) WHERE c.name_key = $1
       ON CONFLICT DO NOTHING RETURNING word_id`,
      [nameKey(c.name), c.words],
    );
    linked += r.rows.length;
  }
  if (added.rows.length || linked) log(`단어 ${added.rows.length}개 추가, 카테고리 연결 ${linked}개 추가 (전체 단어 ${allWords.length}개 기준)`);
  return { added: added.rows.length, linked };
}

/** 벡터 여러 개를 한 번의 쿼리로 저장 */
async function saveVectors(db: Db, table: 'words' | 'categories', column: 'vec' | 'name_vec', ids: number[], vecs: number[][]) {
  await db.query(
    `UPDATE ${table} SET ${column} = v.vec::vector FROM unnest($1::int[], $2::text[]) AS v(id, vec) WHERE ${table}.id = v.id`,
    [ids, vecs.map(vecParam)],
  );
}

/**
 * 단어 · 카테고리 이름 벡터를 계산한다. 서버를 켠 뒤 백그라운드에서 돌아도 된다.
 * - 벡터를 만든 AI가 바뀌면(예: 예시 모드 → Gemini) 기존 벡터를 지우고 다시 계산한다. 서로 다른 모델의 벡터는 비교할 수 없기 때문.
 * - 벡터가 없는 단어는 연관 단어 검색에서 빠지므로, 계산 중에도 핵심 흐름(랜덤 뽑기 · 창조)은 그대로 쓸 수 있다.
 * - 무료 한도를 넘지 않게 묶음(batch)마다 쉬고, 중간에 서버를 꺼도 다음 실행 때 남은 것부터 이어서 계산한다.
 */
export async function ensureEmbeddings(db: Db, ai: AiProvider, log: (m: string) => void = console.log) {
  const meta = async (k: string) => (await db.query<{ value: string }>('SELECT value FROM meta WHERE key = $1', [k])).rows[0]?.value;
  const setMeta = (k: string, v: string) =>
    db.query('INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, v]);

  if ((await meta('embed_target')) !== ai.name) {
    await db.query('UPDATE words SET vec = NULL');
    await db.query('UPDATE categories SET name_vec = NULL');
    await db.query('DELETE FROM embed_cache');
    await setMeta('embed_target', ai.name);
  }

  const todo = (await db.query<{ id: number; text: string }>('SELECT id, text FROM words WHERE vec IS NULL ORDER BY id')).rows;
  const cats = (await db.query<{ id: number; name: string }>('SELECT id, name FROM categories WHERE name_vec IS NULL ORDER BY id')).rows;
  if (!todo.length && !cats.length) return false;

  const { batch, pauseMs } = ai.embedPlan;
  if (todo.length) log(`단어 ${todo.length}개 벡터 계산 시작 (${ai.name}, ${batch}개씩)`);
  for (let i = 0; i < todo.length; i += batch) {
    const chunk = todo.slice(i, i + batch);
    const vecs = await ai.embed(chunk.map((w) => w.text), { patient: true, log });
    await saveVectors(db, 'words', 'vec', chunk.map((w) => w.id), vecs);
    const done = Math.min(i + batch, todo.length);
    if (todo.length > batch) log(`단어 벡터 ${done}/${todo.length}`);
    if (done < todo.length && pauseMs) await sleep(pauseMs);
  }
  if (cats.length) {
    const cv = await ai.embed(cats.map((c) => c.name), { patient: true, log });
    await saveVectors(db, 'categories', 'name_vec', cats.map((c) => c.id), cv);
  }
  log('벡터 계산 완료 — 방향성 · 나만의 카테고리 연관 단어 매칭을 쓸 수 있습니다');
  return true;
}
