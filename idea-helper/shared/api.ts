// 앱과 서버가 함께 쓰는 요청 · 응답 타입 (아키텍처 결정: 언어를 TypeScript 하나로 맞춰 타입 공유)
// 앱은 `import type`으로만 가져오므로 번들에는 포함되지 않는다.

export interface ApiError {
  error: { code: string; message: string };
}

export interface Word {
  id: number;
  text: string;
}

export interface Category {
  id: number;
  name: string;
  kind: 'default' | 'user';
  useCount: number;
}

// POST /auth/anonymous
export interface AuthRequest {
  deviceId: string;
}
export interface AuthResponse {
  userId: string;
  nickname: string;
  token: string;
  expiresAt: string;
}

// GET /categories
export interface CategoriesResponse {
  defaults: Category[];
  userMade: Category[];
}

// POST /words/draw
export interface DrawRequest {
  categoryId: number;
  fixedWordIds: number[];
  excludeWordIds?: number[];
  direction?: string;
}
export interface DrawResponse {
  /** 고정하지 않은 자리에 들어갈 새 단어 (3 - 고정 개수) */
  words: Word[];
  /** 방향성에 맞는 단어가 부족하거나(NARROW_DIRECTION) 방향성 계산을 잠시 못 해서(DIRECTION_UNAVAILABLE) 방향성 없이 뽑았을 때 */
  notice?: 'NARROW_DIRECTION' | 'DIRECTION_UNAVAILABLE';
}

// POST /ideas
export interface IdeaRequest {
  categoryId: number;
  wordIds: number[];
  direction?: string;
}
export interface Idea {
  id: number;
  categoryId: number;
  categoryName: string;
  title: string;
  content: string;
  words: Word[];
  direction: string;
  createdAt: string;
}
/** POST /ideas, POST /ideas/:id/recombine(04 '다시 조합하기': 같은 단어로 다른 아이디어, 항상 AI) */
export interface IdeaResponse {
  idea: Idea;
  /** DB에 저장된 같은 조합을 꺼냈으면 true (AI 호출 0회) */
  fromCache: boolean;
}

// POST /ideas/:id/recipe
export interface Recipe {
  ideaId: number;
  /** food = 재료 · 만드는 순서, plan = 준비물 · 실행 단계 */
  kind: 'food' | 'plan';
  feasible: boolean;
  summary: { time: string; difficulty: string; amount: string };
  ingredients: string[];
  steps: string[];
}
export interface RecipeResponse {
  recipe: Recipe;
  fromCache: boolean;
}

// POST /categories/preview, POST /categories
export interface CategoryNameRequest {
  name: string;
}
export interface CategoryPreviewResponse {
  name: string;
  duplicate: { id: number; name: string } | null;
  matchedCount: number;
  examples: string[];
  canCreate: boolean;
}
export interface CategoryCreateResponse {
  category: { id: number; name: string };
  existed: boolean;
  matchedCount: number;
}

// 공유
export type ReactionKind = 'like' | 'meh' | 'dislike';
export interface ReactionCounts {
  like: number;
  meh: number;
  dislike: number;
}
export interface Post {
  id: number;
  ideaId: number;
  nickname: string;
  categoryName: string;
  createdAt: string;
  title: string;
  content: string;
  words: Word[];
  counts: ReactionCounts;
  myReaction: ReactionKind | null;
  mine: boolean;
}
export interface ShareRequest {
  ideaId: number;
}
export interface ShareResponse {
  shareCode: string;
  url: string;
}
export interface PostResponse {
  post: Post;
  alreadyPosted: boolean;
}
export interface FeedResponse {
  posts: Post[];
  nextCursor: string | null;
}
export interface ReactionRequest {
  kind: ReactionKind | null;
}
export interface ReactionResponse {
  counts: ReactionCounts;
  myReaction: ReactionKind | null;
}
