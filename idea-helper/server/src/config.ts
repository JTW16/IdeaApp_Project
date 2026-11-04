import 'dotenv/config';

const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const optNum = (v: string | undefined) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

const port = num(process.env.PORT, 4000);

export const config = {
  port,
  host: process.env.HOST || '0.0.0.0',
  /** 비어 있으면 내장 PostgreSQL(PGlite)을 쓴다. 배포 때는 관리형 PostgreSQL 주소를 넣는다. */
  databaseUrl: process.env.DATABASE_URL || '',
  /** (선택) DB 서버 인증서 파일 경로. Supabase 대시보드 Database 설정에서 받을 수 있다. 없으면 암호화만 한다. */
  databaseSslCa: process.env.DATABASE_SSL_CA || '',
  pgliteDir: process.env.PGLITE_DIR || './.data/pglite',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  tokenDays: num(process.env.TOKEN_DAYS, 30),
  /** 공유 링크에 쓰는 서버 주소 */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    /** 주 모델이 붐비거나(503) 한도에 걸리면(429) 차례로 시도할 모델 (쉼표로 구분) */
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-flash-latest').split(',').map((s) => s.trim()).filter(Boolean),
    embedModel: process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
    /** 0이면 생각(thinking)을 꺼서 빨라진다. 빈 값이면 보내지 않는다. */
    thinkingBudget: optNum(process.env.GEMINI_THINKING_BUDGET ?? '0'),
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 5000),
    /** 만드는 법은 답이 길어 5초를 자주 넘는다 (5초 목표는 아이디어 생성에만 해당) */
    recipeTimeoutMs: num(process.env.LLM_RECIPE_TIMEOUT_MS, 20000),
    /** 무료 등급 임베딩 한도(분당 100건)를 넘지 않도록 나눠서 계산 */
    embedBatch: num(process.env.EMBED_BATCH, 40),
    embedPauseMs: num(process.env.EMBED_PAUSE_MS, 30000),
  },
  embedDim: 768,
  /** 방향성을 넣었을 때 가까운 단어 몇 개 안에서 뽑을지 */
  directionPool: num(process.env.DIRECTION_POOL, 12),
  /** 연관 단어로 인정할 최대 코사인 거리. 비우면 제한 없음 */
  matchMaxDistance: optNum(process.env.MATCH_MAX_DISTANCE),
  /**
   * 나만의 카테고리 이름이 의미 있는지 판단하는 기준: 연관 단어 40개 중 먼 10개와 가장 가까운 5개의 평균 거리 차이.
   * 단어 2,311개 · Gemini 임베딩 실측(10-18): 'ㅁㄴㅇㄹ' · '아무말대잔치' · 사람 이름 등은 0.027 이하,
   * '분자 요리' · '자취 요리' 같은 두 낱말 이름은 0.031 이상. '공모전'처럼 짧고 넓은 이름은 걸릴 수 있다(더 구체적으로 입력 안내).
   * 비우면 Gemini일 때 0.03, 예시 모드에서는 검사하지 않는다. 단어 풀을 크게 바꾸면 다시 재야 한다.
   */
  matchMinSpread: optNum(process.env.MATCH_MIN_SPREAD),
  limits: {
    authPerHourPerIp: num(process.env.LIMIT_AUTH_PER_HOUR, 30),
    aiPerMinute: num(process.env.LIMIT_AI_PER_MINUTE, 12),
    previewPerMinute: num(process.env.LIMIT_PREVIEW_PER_MINUTE, 20),
    categoriesPerDay: num(process.env.LIMIT_CATEGORIES_PER_DAY, 5),
    postsPerMinute: num(process.env.LIMIT_POSTS_PER_MINUTE, 5),
  },
};

export type Config = typeof config;
