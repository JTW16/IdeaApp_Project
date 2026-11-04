import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { randomBytes } from 'node:crypto';
import type {
  AuthRequest, AuthResponse, CategoriesResponse, Category, CategoryCreateResponse, CategoryNameRequest,
  CategoryPreviewResponse, DrawRequest, DrawResponse, FeedResponse, Idea, IdeaRequest, IdeaResponse, Post,
  PostResponse, ReactionCounts, ReactionKind, ReactionRequest, ReactionResponse, Recipe, RecipeResponse,
  ShareRequest, ShareResponse, Word,
} from '../../shared/api.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { vecParam } from './db.js';
import { AiError, type AiProvider } from './ai.js';
import { DAY, HOUR, MINUTE, RateLimiter } from './limits.js';
import { nameKey } from './seed.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; nick: string };
    user: { sub: string; nick: string };
  }
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const BANNED = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅄ', '개새', '좆', '존나', '니애미', '느금', '썅', 'fuck', 'shit', 'bitch'];
/** 금칙어 검사 (공백 · 대소문자 무시). 카테고리 이름과 AI 결과에 쓴다. */
export const hasBanned = (s: string) => BANNED.some((b) => nameKey(s).includes(b));
// '술'은 기술 · 미술에도, '카페'는 카페 창업에도 들어가서 뺐다 (음식 카테고리로 잘못 판단)
const FOOD_RE = /음식|요리|레시피|메뉴|디저트|베이킹|음료|간식|반찬|빵|과자|안주|주류|칵테일|도시락|밀키트/;
/** 만드는 법 종류: 음식 카테고리면 재료 · 만드는 순서, 아니면 준비물 · 실행 단계 */
export const recipeKind = (categoryName: string): 'food' | 'plan' => (FOOD_RE.test(categoryName) ? 'food' : 'plan');

export const normalizeText = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
export const comboKey = (categoryId: number, wordIds: number[], direction: string) =>
  `${categoryId}:${[...wordIds].sort((a, b) => a - b).join(',')}:${direction}`;

const shuffle = <T>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const shareCode = () => randomBytes(8).toString('base64url');
/** 아이디어 설명을 문장마다 나눈다 (공유 웹 페이지에서 문단으로 보이게, 앱의 IdeaText와 같은 규칙) */
const sentences = (text: string) => text.replace(/([.!?])\s+/g, '$1\n').split('\n').map((s) => s.trim()).filter(Boolean);
const escapeHtml =(s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface AppDeps {
  config: Config;
  db: Db;
  ai: AiProvider;
  /** 요청 로그를 끈다 (테스트 · 시연 준비 스크립트) */
  quiet?: boolean;
}

export async function buildApp({ config, db, ai, quiet }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: quiet || process.env.NODE_ENV === 'test' ? false : { level: 'info' } });
  const limiter = new RateLimiter();
  const minSpread = config.matchMinSpread ?? (ai.name === 'gemini' ? 0.03 : null);
  /** 서버를 켠 뒤 AI로 만든 수 / DB에서 꺼낸 수 (기획서 목표 4 확인용, /health에 보임) */
  const stats = { aiIdeas: 0, cachedIdeas: 0, aiRecipes: 0, cachedRecipes: 0 };

  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });
  await app.register(jwt, { secret: config.jwtSecret });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof AiError) {
      app.log.warn(`${err.code}: ${err.message}`);
      if (err.code === 'AI_QUOTA') {
        return reply.status(429).send({ error: { code: err.code, message: 'AI 사용 한도를 다 썼어요. 잠시 후 다시 시도해 주세요.' } });
      }
      const status = err.code === 'AI_TIMEOUT' ? 504 : 502;
      return reply.status(status).send({ error: { code: err.code, message: 'AI가 답을 주지 못했습니다. 다시 시도해 주세요.' } });
    }
    if (err.validation) return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: err.message } });
    if (err.statusCode === 401 || err.code?.startsWith?.('FST_JWT')) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: '익명 토큰이 없거나 만료되었습니다' } });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: 'SERVER_ERROR', message: '서버 오류가 발생했습니다' } });
  });

  const auth = async (req: FastifyRequest) => {
    await req.jwtVerify();
    // DB를 초기화하면(시연 준비) 토큰은 살아 있어도 사용자가 없다 → 401을 주면 앱이 알아서 다시 발급받는다
    const u = await db.query('SELECT 1 FROM anon_users WHERE id = $1', [req.user.sub]);
    if (!u.rows[0]) throw new AppError(401, 'UNAUTHORIZED', '익명 토큰이 없거나 만료되었습니다');
  };
  const limit = (key: string, max: number, windowMs: number) => {
    if (!limiter.take(key, max, windowMs)) throw new AppError(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  };

  // ---------- 공통 조회 ----------
  async function embedCached(text: string): Promise<string> {
    const hit = await db.query<{ vec: string }>('SELECT vec::text AS vec FROM embed_cache WHERE text = $1', [text]);
    if (hit.rows[0]) return hit.rows[0].vec;
    const [v] = await ai.embed([text]);
    const p = vecParam(v);
    await db.query('INSERT INTO embed_cache (text, vec) VALUES ($1, $2::vector) ON CONFLICT (text) DO NOTHING', [text, p]);
    return p;
  }
  async function getCategory(id: number) {
    const r = await db.query<{ id: number; name: string; kind: 'default' | 'user' }>('SELECT id, name, kind FROM categories WHERE id = $1', [id]);
    if (!r.rows[0]) throw new AppError(404, 'CATEGORY_NOT_FOUND', '카테고리를 찾을 수 없습니다');
    return r.rows[0];
  }
  async function wordsByIds(ids: number[]): Promise<Map<number, Word>> {
    if (!ids.length) return new Map();
    const r = await db.query<Word>('SELECT id, text FROM words WHERE id = ANY($1::int[])', [ids]);
    return new Map(r.rows.map((w) => [w.id, w]));
  }
  async function loadIdea(id: number): Promise<Idea & { hidden: boolean }> {
    const r = await db.query(
      `SELECT i.id, i.category_id, c.name AS category_name, i.title, i.content, i.word_ids, i.direction, i.created_at, i.hidden
         FROM ideas i JOIN categories c ON c.id = i.category_id WHERE i.id = $1`,
      [id],
    );
    const row = r.rows[0];
    if (!row) throw new AppError(404, 'IDEA_NOT_FOUND', '아이디어를 찾을 수 없습니다');
    const wm = await wordsByIds(row.word_ids);
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      title: row.title,
      content: row.content,
      words: row.word_ids.map((w: number) => wm.get(w)).filter(Boolean) as Word[],
      direction: row.direction,
      createdAt: new Date(row.created_at).toISOString(),
      hidden: row.hidden,
    };
  }
  const publicIdea = ({ hidden, ...idea }: Idea & { hidden: boolean }): Idea => idea;

  /** AI로 아이디어 하나를 만든다: 호출 제한, 앱이 연결을 끊으면(03 '취소' 등) AI 호출도 중단, 빈 결과 · 금칙어는 저장하지 않게 거절 */
  async function aiIdea(
    req: FastifyRequest, reply: FastifyReply,
    input: { categoryName: string; wordIds: number[]; direction: string; avoid?: string[] },
  ) {
    limit(`ai:${req.user.sub}`, config.limits.aiPerMinute, MINUTE);
    const cancel = new AbortController();
    reply.raw.on('close', () => { if (!reply.raw.writableFinished) cancel.abort(); });
    const wm = await wordsByIds(input.wordIds);
    const out = await ai.generateIdea({ ...input, words: input.wordIds.map((id) => wm.get(id)!.text) }, cancel.signal);
    const title = normalizeText(out?.title).slice(0, 60);
    const content = String(out?.content ?? '').trim().slice(0, 1000);
    if (!title || !content) throw new AiError('AI_BAD_OUTPUT', 'AI 결과가 비어 있습니다');
    if (hasBanned(title + content)) throw new AiError('AI_BAD_OUTPUT', 'AI 결과에 금칙어가 들어 있습니다');
    stats.aiIdeas++;
    return { title, content };
  }

  async function matchWords(name: string) {
    const v = await embedCached(name);
    // 한 글자 단어(성 · 비 · 김 · 별 …)는 뜻이 여러 개라 어떤 문장과도 가깝게 잡혀서(허브 단어) 연관 단어에서 뺀다
    const r = await db.query<{ id: number; text: string; dist: number }>(
      `SELECT id, text, (vec <=> $1::vector) AS dist FROM words
        WHERE vec IS NOT NULL AND char_length(text) >= 2 AND ($2::float8 IS NULL OR (vec <=> $1::vector) <= $2::float8)
        ORDER BY vec <=> $1::vector LIMIT 40`,
      [v, config.matchMaxDistance],
    );
    // 뜻을 알 수 없는 이름은 모든 단어와 비슷하게 멀다 → 가장 가까운 5개와 40개 중 먼 10개의 평균 거리 차이가 작으면 연관 단어 없음.
    // (거리 제한 MATCH_MAX_DISTANCE로 40개가 안 되면 그 제한이 이미 걸러낸 것이므로 검사하지 않는다)
    const d = r.rows.map((w) => Number(w.dist));
    const avg = (x: number[]) => x.reduce((s, n) => s + n, 0) / x.length;
    if (minSpread !== null && d.length >= 40 && avg(d.slice(-10)) - avg(d.slice(0, 5)) < minSpread) return { vec: v, words: [] };
    return { vec: v, words: r.rows };
  }
  function checkName(raw: string) {
    const name = normalizeText(raw);
    if ([...name].length < 2 || [...name].length > 20) throw new AppError(400, 'INVALID_NAME', '카테고리 이름은 2~20자로 입력해 주세요');
    if (hasBanned(name)) throw new AppError(400, 'INVALID_NAME', '사용할 수 없는 단어가 들어 있어요');
    return name;
  }
  async function findDuplicate(name: string) {
    const r = await db.query<{ id: number; name: string }>('SELECT id, name FROM categories WHERE name_key = $1', [nameKey(name)]);
    return r.rows[0] ?? null;
  }

  // ---------- 상태 ----------
  app.get('/health', async () => {
    const r = await db.query<{ done: number; total: number }>('SELECT count(vec)::int AS done, count(*)::int AS total FROM words');
    return { ok: true, db: db.kind, ai: ai.name, wordVectors: r.rows[0], stats };
  });
  app.get('/', async () => ({ name: '아이디어 보조 어플 API 서버', health: '/health', ai: ai.name === 'mock' ? '예시 모드 (GEMINI_API_KEY 없음)' : 'gemini' }));

  // ---------- 00 앱 처음 실행: 익명 토큰 ----------
  app.post<{ Body: AuthRequest }>('/auth/anonymous', {
    schema: {
      body: {
        type: 'object', required: ['deviceId'], additionalProperties: false,
        properties: { deviceId: { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]+$' } },
      },
    },
  }, async (req): Promise<AuthResponse> => {
    limit(`auth:${req.ip}`, config.limits.authPerHourPerIp, HOUR);
    const nickname = `익명의 발상가 #${String(Math.floor(1000 + Math.random() * 9000))}`;
    const r = await db.query<{ id: string; nickname: string }>(
      `INSERT INTO anon_users (device_id, nickname) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id RETURNING id, nickname`,
      [req.body.deviceId, nickname],
    );
    const user = r.rows[0];
    const token = app.jwt.sign({ sub: user.id, nick: user.nickname }, { expiresIn: `${config.tokenDays}d` });
    return { userId: user.id, nickname: user.nickname, token, expiresAt: new Date(Date.now() + config.tokenDays * DAY).toISOString() };
  });

  // ---------- 01 카테고리 목록 ----------
  app.get('/categories', { onRequest: auth }, async (): Promise<CategoriesResponse> => {
    const toCat = (r: any): Category => ({ id: r.id, name: r.name, kind: r.kind, useCount: r.use_count });
    const d = await db.query("SELECT id, name, kind, use_count FROM categories WHERE kind = 'default' ORDER BY id");
    const u = await db.query("SELECT id, name, kind, use_count FROM categories WHERE kind = 'user' ORDER BY use_count DESC, id DESC LIMIT 12");
    return { defaults: d.rows.map(toCat), userMade: u.rows.map(toCat) };
  });

  // ---------- 02 단어 뽑기 · 다시 뽑기 · 방향성 ----------
  app.post<{ Body: DrawRequest }>('/words/draw', {
    onRequest: auth,
    schema: {
      body: {
        type: 'object', required: ['categoryId', 'fixedWordIds'], additionalProperties: false,
        properties: {
          categoryId: { type: 'integer', minimum: 1 },
          fixedWordIds: { type: 'array', maxItems: 2, uniqueItems: true, items: { type: 'integer' } },
          excludeWordIds: { type: 'array', maxItems: 10, items: { type: 'integer' } },
          direction: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (req): Promise<DrawResponse> => {
    const { categoryId, fixedWordIds } = req.body;
    const exclude = req.body.excludeWordIds ?? [];
    const direction = normalizeText(req.body.direction);
    if ([...direction].length > 50) throw new AppError(400, 'DIRECTION_TOO_LONG', '방향성은 50자 이내로 입력해 주세요');
    await getCategory(categoryId);

    const total = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM category_words WHERE category_id = $1', [categoryId]);
    if (total.rows[0].n < 3) throw new AppError(422, 'NOT_ENOUGH_WORDS', '이 카테고리에 단어가 부족합니다');
    if (fixedWordIds.length) {
      const ok = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM category_words WHERE category_id = $1 AND word_id = ANY($2::int[])',
        [categoryId, fixedWordIds],
      );
      if (ok.rows[0].n !== fixedWordIds.length) throw new AppError(400, 'INVALID_FIXED', '고정한 단어가 이 카테고리에 없습니다');
    }
    const need = 3 - fixedWordIds.length;

    const randomDraw = async () => {
      const fresh = await db.query<Word>(
        `SELECT w.id, w.text FROM category_words cw JOIN words w ON w.id = cw.word_id
          WHERE cw.category_id = $1 AND NOT (w.id = ANY($2::int[])) AND NOT (w.id = ANY($3::int[]))
          ORDER BY random() LIMIT $4`,
        [categoryId, fixedWordIds, exclude, need],
      );
      if (fresh.rows.length >= need) return fresh.rows;
      const any = await db.query<Word>(
        `SELECT w.id, w.text FROM category_words cw JOIN words w ON w.id = cw.word_id
          WHERE cw.category_id = $1 AND NOT (w.id = ANY($2::int[])) ORDER BY random() LIMIT $3`,
        [categoryId, fixedWordIds, need],
      );
      return any.rows;
    };

    if (!direction) return { words: await randomDraw() };

    let dv: string;
    try {
      dv = await embedCached(direction);
    } catch (e) {
      app.log.warn(e, '방향성 임베딩 실패 — 방향성 없이 뽑음');
      return { words: await randomDraw(), notice: 'DIRECTION_UNAVAILABLE' };
    }
    const near = await db.query<Word>(
      `SELECT w.id, w.text FROM category_words cw JOIN words w ON w.id = cw.word_id
        WHERE cw.category_id = $1 AND NOT (w.id = ANY($2::int[])) AND w.vec IS NOT NULL
          AND ($4::float8 IS NULL OR (w.vec <=> $3::vector) <= $4::float8)
        ORDER BY w.vec <=> $3::vector LIMIT $5`,
      [categoryId, fixedWordIds, dv, config.matchMaxDistance, config.directionPool],
    );
    if (near.rows.length < need) return { words: await randomDraw(), notice: 'NARROW_DIRECTION' };
    const preferred = near.rows.filter((w) => !exclude.includes(w.id));
    const pool = preferred.length >= need ? preferred : near.rows;
    return { words: shuffle(pool).slice(0, need) };
  });

  // ---------- 02 → 03 '창조': 같은 조합은 DB에서, 없을 때만 AI ----------
  app.post<{ Body: IdeaRequest }>('/ideas', {
    onRequest: auth,
    schema: {
      body: {
        type: 'object', required: ['categoryId', 'wordIds'], additionalProperties: false,
        properties: {
          categoryId: { type: 'integer', minimum: 1 },
          wordIds: { type: 'array', minItems: 3, maxItems: 3, uniqueItems: true, items: { type: 'integer' } },
          direction: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (req, reply): Promise<IdeaResponse> => {
    const { categoryId, wordIds } = req.body;
    const direction = normalizeText(req.body.direction);
    if ([...direction].length > 50) throw new AppError(400, 'DIRECTION_TOO_LONG', '방향성은 50자 이내로 입력해 주세요');
    const cat = await getCategory(categoryId);
    const inCat = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM category_words WHERE category_id = $1 AND word_id = ANY($2::int[])',
      [categoryId, wordIds],
    );
    if (inCat.rows[0].n !== 3) throw new AppError(400, 'INVALID_WORDS', '단어 3개가 이 카테고리에 없습니다');

    const key = comboKey(categoryId, wordIds, direction);
    await db.query('UPDATE categories SET use_count = use_count + 1 WHERE id = $1', [categoryId]);
    const existing = await db.query<{ id: number; hidden: boolean }>('SELECT id, hidden FROM ideas WHERE combo_key = $1', [key]);
    if (existing.rows[0] && !existing.rows[0].hidden) {
      stats.cachedIdeas++;
      return { idea: publicIdea(await loadIdea(existing.rows[0].id)), fromCache: true };
    }

    // 03에서 '취소'하면 앱이 연결을 끊는다 → AI 호출도 멈춰서 한도를 아낀다
    const { title, content } = await aiIdea(req, reply, { categoryName: cat.name, wordIds, direction });

    if (existing.rows[0]?.hidden) {
      // 숨긴 결과는 버리고 새 결과로 바꾼다. 예전 내용의 만드는 법 · 공유 글도 함께 지운다.
      const id = existing.rows[0].id;
      await db.query('DELETE FROM recipes WHERE idea_id = $1', [id]);
      await db.query('DELETE FROM posts WHERE idea_id = $1', [id]);
      await db.query('UPDATE ideas SET title = $2, content = $3, hidden = false, report_count = 0, created_at = now() WHERE id = $1', [id, title, content]);
      return { idea: publicIdea(await loadIdea(id)), fromCache: false };
    }

    const ins = await db.query<{ id: number }>(
      `INSERT INTO ideas (category_id, word_ids, direction, combo_key, title, content)
       VALUES ($1, $2::int[], $3, $4, $5, $6) ON CONFLICT (combo_key) DO NOTHING RETURNING id`,
      [categoryId, wordIds, direction, key, title, content],
    );
    // 같은 조합이 동시에 들어와도 유일 키 덕분에 한 건만 저장된다
    const id = ins.rows[0]?.id ?? (await db.query<{ id: number }>('SELECT id FROM ideas WHERE combo_key = $1', [key])).rows[0].id;
    return { idea: publicIdea(await loadIdea(id)), fromCache: !ins.rows[0] };
  });

  // ---------- 04 '다시 조합하기': 같은 단어 3개 · 방향성으로 다른 아이디어 (누를 때마다 AI) ----------
  // 원래 조합 키 뒤에 '#임의값'을 붙여 새로 저장한다 → '창조'의 같은 조합 재사용(목표 4)은 원래 결과 그대로,
  // 확정 · 만드는 법 · 공유는 아이디어 번호로 동작한다. 이미 나온 결과(최근 10개)를 AI에 알려 겹치지 않게 한다.
  app.post<{ Params: { id: string } }>('/ideas/:id/recombine', { onRequest: auth }, async (req, reply): Promise<IdeaResponse> => {
    const ideaId = Number(req.params.id);
    if (!Number.isInteger(ideaId)) throw new AppError(400, 'BAD_REQUEST', '잘못된 아이디어 번호입니다');
    const src = (await db.query<{ category_id: number; word_ids: number[]; direction: string }>(
      'SELECT category_id, word_ids, direction FROM ideas WHERE id = $1', [ideaId],
    )).rows[0];
    if (!src) throw new AppError(404, 'IDEA_NOT_FOUND', '아이디어를 찾을 수 없습니다');
    const cat = await getCategory(src.category_id);
    const prev = await db.query<{ title: string; content: string }>(
      `SELECT title, content FROM ideas
        WHERE category_id = $1 AND direction = $2 AND word_ids @> $3::int[] AND word_ids <@ $3::int[] AND NOT hidden
        ORDER BY id DESC LIMIT 10`,
      [src.category_id, src.direction, src.word_ids],
    );
    const avoid = prev.rows.map((r) => `${r.title}: ${r.content.slice(0, 80)}`);
    const { title, content } = await aiIdea(req, reply, { categoryName: cat.name, wordIds: src.word_ids, direction: src.direction, avoid });
    const key = `${comboKey(src.category_id, src.word_ids, src.direction)}#${randomBytes(6).toString('hex')}`;
    const ins = await db.query<{ id: number }>(
      `INSERT INTO ideas (category_id, word_ids, direction, combo_key, title, content) VALUES ($1, $2::int[], $3, $4, $5, $6) RETURNING id`,
      [src.category_id, src.word_ids, src.direction, key, title, content],
    );
    return { idea: publicIdea(await loadIdea(ins.rows[0].id)), fromCache: false };
  });

  // ---------- 05 → 05-1 만드는 법 ----------
  app.post<{ Params: { id: string } }>('/ideas/:id/recipe', { onRequest: auth }, async (req): Promise<RecipeResponse> => {
    const ideaId = Number(req.params.id);
    if (!Number.isInteger(ideaId)) throw new AppError(400, 'BAD_REQUEST', '잘못된 아이디어 번호입니다');
    const idea = await loadIdea(ideaId);
    if (idea.hidden) throw new AppError(404, 'IDEA_NOT_FOUND', '아이디어를 찾을 수 없습니다');
    const toRecipe = (r: any): Recipe => ({
      ideaId: r.idea_id, kind: r.kind, feasible: r.feasible, summary: r.summary, ingredients: r.ingredients, steps: r.steps,
    });
    const saved = await db.query('SELECT * FROM recipes WHERE idea_id = $1', [ideaId]);
    if (saved.rows[0]) {
      stats.cachedRecipes++;
      return { recipe: toRecipe(saved.rows[0]), fromCache: true };
    }

    limit(`ai:${req.user.sub}`, config.limits.aiPerMinute, MINUTE);
    const kind = recipeKind(idea.categoryName);
    const out = await ai.generateRecipe({ categoryName: idea.categoryName, kind, title: idea.title, content: idea.content, words: idea.words.map((w) => w.text) });
    stats.aiRecipes++;
    const strs = (a: unknown) => (Array.isArray(a) ? a.map((x) => normalizeText(String(x))).filter(Boolean).slice(0, 10) : []);
    const feasible = Boolean(out?.feasible) && strs(out?.steps).length > 0;
    const summary = {
      time: normalizeText(out?.summary?.time) || '-', difficulty: normalizeText(out?.summary?.difficulty) || '-', amount: normalizeText(out?.summary?.amount) || '-',
    };
    await db.query(
      `INSERT INTO recipes (idea_id, kind, feasible, summary, ingredients, steps) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       ON CONFLICT (idea_id) DO NOTHING`,
      [ideaId, kind, feasible, JSON.stringify(summary), JSON.stringify(strs(out?.ingredients)), JSON.stringify(strs(out?.steps))],
    );
    const row = (await db.query('SELECT * FROM recipes WHERE idea_id = $1', [ideaId])).rows[0];
    return { recipe: toRecipe(row), fromCache: false };
  });

  // ---------- 01-1 나만의 카테고리 ----------
  const nameSchema = {
    body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', maxLength: 100 } } },
  };
  app.post<{ Body: CategoryNameRequest }>('/categories/preview', { onRequest: auth, schema: nameSchema }, async (req): Promise<CategoryPreviewResponse> => {
    const name = checkName(req.body.name);
    limit(`preview:${req.user.sub}`, config.limits.previewPerMinute, MINUTE);
    const duplicate = await findDuplicate(name);
    const { words } = await matchWords(name);
    return {
      name,
      duplicate,
      matchedCount: words.length,
      examples: words.slice(0, 9).map((w) => w.text),
      canCreate: !duplicate && words.length >= 10,
    };
  });

  app.post<{ Body: CategoryNameRequest }>('/categories', { onRequest: auth, schema: nameSchema }, async (req): Promise<CategoryCreateResponse> => {
    const name = checkName(req.body.name);
    const duplicate = await findDuplicate(name);
    if (duplicate) return { category: duplicate, existed: true, matchedCount: 0 };
    const { vec, words } = await matchWords(name);
    if (words.length < 10) throw new AppError(422, 'NOT_ENOUGH_WORDS', '연관 단어가 부족해요. 이름을 바꿔 입력해 주세요.');
    limit(`category:${req.user.sub}`, config.limits.categoriesPerDay, DAY);
    const ins = await db.query<{ id: number; name: string }>(
      `INSERT INTO categories (name, name_key, kind, name_vec, created_by) VALUES ($1, $2, 'user', $3::vector, $4)
       ON CONFLICT DO NOTHING RETURNING id, name`,
      [name, nameKey(name), vec, req.user.sub],
    );
    if (!ins.rows[0]) {
      const again = await findDuplicate(name);
      return { category: again!, existed: true, matchedCount: 0 };
    }
    const cat = ins.rows[0];
    await db.query(
      `INSERT INTO category_words (category_id, word_id, score)
       SELECT $1, w.id, w.score FROM unnest($2::int[], $3::float8[]) AS w(id, score) ON CONFLICT DO NOTHING`,
      [cat.id, words.map((w) => w.id), words.map((w) => 1 - Number(w.dist))],
    );
    return { category: cat, existed: false, matchedCount: words.length };
  });

  // ---------- 06 공유 ----------
  async function ensureShareable(ideaId: number) {
    const idea = await loadIdea(ideaId);
    if (idea.hidden) throw new AppError(404, 'IDEA_NOT_FOUND', '아이디어를 찾을 수 없습니다');
    return idea;
  }
  const shareSchema = {
    body: { type: 'object', required: ['ideaId'], additionalProperties: false, properties: { ideaId: { type: 'integer', minimum: 1 } } },
  };

  app.post<{ Body: ShareRequest }>('/shares', { onRequest: auth, schema: shareSchema }, async (req): Promise<ShareResponse> => {
    await ensureShareable(req.body.ideaId);
    limit(`post:${req.user.sub}`, config.limits.postsPerMinute * 2, MINUTE);
    const r = await db.query<{ share_code: string }>(
      `INSERT INTO posts (idea_id, user_id, scope, share_code) VALUES ($1, $2, 'link', $3)
       ON CONFLICT (idea_id, user_id, scope) DO UPDATE SET scope = EXCLUDED.scope RETURNING share_code`,
      [req.body.ideaId, req.user.sub, shareCode()],
    );
    const code = r.rows[0].share_code;
    return { shareCode: code, url: `${config.publicBaseUrl}/s/${code}` };
  });

  async function loadPosts(userId: string, where: string, params: unknown[], order: string, limitN: number, offset: number): Promise<Post[]> {
    const r = await db.query(
      `SELECT p.id, p.idea_id, p.created_at, u.nickname, (p.user_id = $1::uuid) AS mine,
              i.title, i.content, i.word_ids, c.name AS category_name,
              COALESCE(rc.likes, 0) AS likes, COALESCE(rc.mehs, 0) AS mehs, COALESCE(rc.dislikes, 0) AS dislikes,
              mr.kind AS my_reaction
         FROM posts p
         JOIN ideas i ON i.id = p.idea_id
         JOIN categories c ON c.id = i.category_id
         JOIN anon_users u ON u.id = p.user_id
         LEFT JOIN (
           SELECT post_id,
                  (count(*) FILTER (WHERE kind = 'like'))::int AS likes,
                  (count(*) FILTER (WHERE kind = 'meh'))::int AS mehs,
                  (count(*) FILTER (WHERE kind = 'dislike'))::int AS dislikes
             FROM reactions GROUP BY post_id
         ) rc ON rc.post_id = p.id
         LEFT JOIN reactions mr ON mr.post_id = p.id AND mr.user_id = $1::uuid
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${limitN} OFFSET ${offset}`,
      [userId, ...params],
    );
    const wm = await wordsByIds([...new Set(r.rows.flatMap((x: any) => x.word_ids as number[]))]);
    return r.rows.map((x: any) => ({
      id: x.id,
      ideaId: x.idea_id,
      nickname: x.nickname,
      categoryName: x.category_name,
      createdAt: new Date(x.created_at).toISOString(),
      title: x.title,
      content: x.content,
      words: (x.word_ids as number[]).map((w) => wm.get(w)).filter(Boolean) as Word[],
      counts: { like: x.likes, meh: x.mehs, dislike: x.dislikes },
      myReaction: x.my_reaction ?? null,
      mine: x.mine,
    }));
  }

  app.post<{ Body: ShareRequest }>('/posts', { onRequest: auth, schema: shareSchema }, async (req): Promise<PostResponse> => {
    await ensureShareable(req.body.ideaId);
    const existing = await db.query<{ id: number }>("SELECT id FROM posts WHERE idea_id = $1 AND user_id = $2 AND scope = 'feed'", [req.body.ideaId, req.user.sub]);
    let postId = existing.rows[0]?.id;
    const alreadyPosted = Boolean(postId);
    if (!postId) {
      limit(`post:${req.user.sub}`, config.limits.postsPerMinute, MINUTE);
      postId = (await db.query<{ id: number }>(
        "INSERT INTO posts (idea_id, user_id, scope, share_code) VALUES ($1, $2, 'feed', $3) RETURNING id",
        [req.body.ideaId, req.user.sub, shareCode()],
      )).rows[0].id;
    }
    const [post] = await loadPosts(req.user.sub, 'p.id = $2', [postId], 'p.id', 1, 0);
    return { post, alreadyPosted };
  });

  // ---------- 07 공유 피드 ----------
  app.get<{ Querystring: { sort?: string; cursor?: string } }>('/posts', {
    onRequest: auth,
    schema: {
      querystring: {
        type: 'object', additionalProperties: false,
        properties: { sort: { type: 'string', enum: ['latest', 'popular'] }, cursor: { type: 'string', pattern: '^[0-9]{1,6}$' } },
      },
    },
  }, async (req): Promise<FeedResponse> => {
    const PAGE = 20;
    const offset = Number(req.query.cursor ?? 0);
    const order = req.query.sort === 'popular'
      ? 'COALESCE(rc.likes, 0) DESC, p.created_at DESC, p.id DESC'
      : 'p.created_at DESC, p.id DESC';
    const posts = await loadPosts(req.user.sub, "p.scope = 'feed' AND NOT i.hidden", [], order, PAGE + 1, offset);
    return { posts: posts.slice(0, PAGE), nextCursor: posts.length > PAGE ? String(offset + PAGE) : null };
  });

  app.put<{ Params: { id: string }; Body: ReactionRequest }>('/posts/:id/reaction', {
    onRequest: auth,
    schema: {
      body: {
        type: 'object', required: ['kind'], additionalProperties: false,
        properties: { kind: { anyOf: [{ type: 'string', enum: ['like', 'meh', 'dislike'] }, { type: 'null' }] } },
      },
    },
  }, async (req): Promise<ReactionResponse> => {
    const postId = Number(req.params.id);
    const p = await db.query<{ user_id: string }>("SELECT user_id FROM posts WHERE id = $1 AND scope = 'feed'", [postId]);
    if (!p.rows[0]) throw new AppError(404, 'POST_NOT_FOUND', '글을 찾을 수 없습니다');
    if (p.rows[0].user_id === req.user.sub) throw new AppError(403, 'OWN_POST', '내 글에는 반응할 수 없어요');
    const kind = req.body.kind as ReactionKind | null;
    if (kind === null) await db.query('DELETE FROM reactions WHERE post_id = $1 AND user_id = $2', [postId, req.user.sub]);
    else {
      await db.query(
        `INSERT INTO reactions (post_id, user_id, kind) VALUES ($1, $2, $3)
         ON CONFLICT (post_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now()`,
        [postId, req.user.sub, kind],
      );
    }
    const c = await db.query<{ kind: ReactionKind; n: number }>('SELECT kind, count(*)::int AS n FROM reactions WHERE post_id = $1 GROUP BY kind', [postId]);
    const counts: ReactionCounts = { like: 0, meh: 0, dislike: 0 };
    for (const row of c.rows) counts[row.kind] = row.n;
    return { counts, myReaction: kind };
  });

  // ---------- 공유 링크 웹 페이지 (앱 없이 읽기 전용) ----------
  app.get<{ Params: { code: string } }>('/s/:code', async (req, reply) => {
    const r = await db.query<{ idea_id: number }>('SELECT idea_id FROM posts WHERE share_code = $1', [req.params.code]);
    const page = (body: string, status = 200) =>
      reply.status(status).type('text/html; charset=utf-8').send(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>아이디어 보조 어플</title>
<style>body{margin:0;background:#f2f2f5;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1f1f24;word-break:keep-all}
main{max-width:520px;margin:0 auto;padding:32px 20px}.card{background:#fff;border:1px solid #d6d6de;border-radius:16px;padding:24px}
h1{font-size:22px;margin:0 0 12px}p{line-height:1.6;margin:0 0 10px}.meta{color:#737380;font-size:13px;margin-bottom:8px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:16px}.chip{background:#f2f2f5;border:1px solid #d6d6de;border-radius:999px;padding:4px 12px;font-size:13px}
h2{font-size:16px;margin:24px 0 8px}ol,ul{padding-left:20px;line-height:1.7;margin:0}footer{color:#737380;font-size:12px;text-align:center;margin-top:20px}</style>
</head><body><main>${body}<footer>아이디어 보조 어플에서 만든 아이디어 · 읽기 전용</footer></main></body></html>`);
    if (!r.rows[0]) return page('<div class="card"><h1>공유된 아이디어를 찾을 수 없어요</h1><p>링크가 잘못되었거나 내려간 글입니다.</p></div>', 404);
    const idea = await loadIdea(r.rows[0].idea_id);
    if (idea.hidden) return page('<div class="card"><h1>내려간 아이디어예요</h1></div>', 404);
    const rec = (await db.query('SELECT * FROM recipes WHERE idea_id = $1 AND feasible', [idea.id])).rows[0];
    const recipeHtml = rec
      ? `<h2>${rec.kind === 'food' ? '재료' : '준비물'}</h2><ul>${rec.ingredients.map((x: string) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
         <h2>${rec.kind === 'food' ? '만드는 순서' : '실행 단계'}</h2><ol>${rec.steps.map((x: string) => `<li>${escapeHtml(x)}</li>`).join('')}</ol>`
      : '';
    return page(`<div class="card"><div class="meta">${escapeHtml(idea.categoryName)}</div><h1>${escapeHtml(idea.title)}</h1>
${sentences(idea.content).map((s) => `<p>${escapeHtml(s)}</p>`).join('')}<div class="chips">${idea.words.map((w) => `<span class="chip">${escapeHtml(w.text)}</span>`).join('')}</div>${recipeHtml}</div>`);
  });

  return app;
}
