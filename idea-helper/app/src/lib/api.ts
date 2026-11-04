// API 서버 호출. 첫 실행 때 기기 ID로 익명 토큰을 받고, 이후 모든 요청에 붙인다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type {
  ApiError, AuthResponse, CategoriesResponse, CategoryCreateResponse, CategoryPreviewResponse, DrawRequest,
  DrawResponse, FeedResponse, IdeaRequest, IdeaResponse, PostResponse, ReactionKind, ReactionResponse,
  RecipeResponse, ShareResponse,
} from '../../../shared/api';

/** 서버 주소: EXPO_PUBLIC_API_URL이 있으면 그것, 없으면 Expo 개발 서버와 같은 PC의 4000번 포트 */
function resolveBaseUrl() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}
export const BASE_URL = resolveBaseUrl();

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const DEVICE_KEY = 'idea-helper/device-id';
const TOKEN_KEY = 'idea-helper/token';
let token: string | null = null;
let me: { userId: string; nickname: string } | null = null;

async function deviceId() {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function signIn(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: await deviceId() }),
  });
  if (!res.ok) throw await toFailure(res);
  const data = (await res.json()) as AuthResponse;
  token = data.token;
  me = { userId: data.userId, nickname: data.nickname };
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ token: data.token, userId: data.userId, nickname: data.nickname, expiresAt: data.expiresAt }));
  return data.token;
}

async function getToken() {
  if (token) return token;
  const saved = await AsyncStorage.getItem(TOKEN_KEY);
  if (saved) {
    const s = JSON.parse(saved);
    if (new Date(s.expiresAt).getTime() - Date.now() > 60_000) {
      token = s.token;
      me = { userId: s.userId, nickname: s.nickname };
      return s.token as string;
    }
  }
  return signIn();
}

async function toFailure(res: Response) {
  try {
    const body = (await res.json()) as ApiError;
    return new ApiFailure(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? '요청에 실패했습니다');
  } catch {
    return new ApiFailure(res.status, 'ERROR', '요청에 실패했습니다');
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { authorization: `Bearer ${await getToken()}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiFailure(0, 'NETWORK', `서버에 연결할 수 없습니다 (${BASE_URL})`);
  }
  if (res.status === 401 && !retried) {
    token = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
    return request<T>(method, path, body, signal, true);
  }
  if (!res.ok) throw await toFailure(res);
  return (await res.json()) as T;
}

export const api = {
  ready: async () => { await getToken(); return me; },
  categories: () => request<CategoriesResponse>('GET', '/categories'),
  draw: (b: DrawRequest) => request<DrawResponse>('POST', '/words/draw', b),
  createIdea: (b: IdeaRequest, signal?: AbortSignal) => request<IdeaResponse>('POST', '/ideas', b, signal),
  recombine: (ideaId: number, signal?: AbortSignal) => request<IdeaResponse>('POST', `/ideas/${ideaId}/recombine`, {}, signal),
  recipe: (ideaId: number) => request<RecipeResponse>('POST', `/ideas/${ideaId}/recipe`, {}),
  previewCategory: (name: string) => request<CategoryPreviewResponse>('POST', '/categories/preview', { name }),
  createCategory: (name: string) => request<CategoryCreateResponse>('POST', '/categories', { name }),
  shareLink: (ideaId: number) => request<ShareResponse>('POST', '/shares', { ideaId }),
  post: (ideaId: number) => request<PostResponse>('POST', '/posts', { ideaId }),
  feed: (sort: 'latest' | 'popular', cursor?: string | null) =>
    request<FeedResponse>('GET', `/posts?sort=${sort}${cursor ? `&cursor=${cursor}` : ''}`),
  react: (postId: number, kind: ReactionKind | null) => request<ReactionResponse>('PUT', `/posts/${postId}/reaction`, { kind }),
};

export const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e.message : fallback);
