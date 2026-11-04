// 핵심 흐름(02 → 03 → 04 → 05 → 05-1)이 함께 쓰는 상태. 화면 사이에 객체를 넘기지 않으려고 둔 작은 저장소.
import { useSyncExternalStore } from 'react';
import type { Idea, Recipe, Word } from '../../../shared/api';
import { ApiFailure, api, errorMessage } from './api';

export interface FlowState {
  category: { id: number; name: string } | null;
  /** 화면에 보이는 단어 3자리 (뽑는 중이면 null) */
  words: (Word | null)[];
  /** 고정한 단어 ID (최대 2개) */
  fixed: number[];
  /** 적용된 방향성 */
  direction: string;
  /** 04에서 고른(확정할) 아이디어 */
  idea: Idea | null;
  fromCache: boolean;
  /** 04 결과 목록: '창조' 결과 + '다시 조합하기' 결과 (최신이 맨 앞) */
  results: { idea: Idea; fromCache: boolean }[];
  recipe: Recipe | null;
  /** 단어 뽑기 상태 (02 화면) */
  draw: { error: string | null; notice: string | null; empty: boolean };
}

const initial: FlowState = {
  category: null, words: [null, null, null], fixed: [], direction: '', idea: null, fromCache: false, results: [], recipe: null,
  draw: { error: null, notice: null, empty: false },
};
let state: FlowState = initial;
const listeners = new Set<() => void>();

export const flow = {
  get: () => state,
  set(patch: Partial<FlowState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  /** 카테고리를 새로 고르면 고정 · 방향성 초기화 */
  start(category: { id: number; name: string }) {
    flow.set({ ...initial, category });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** 02 단어 뽑기 · 다시 뽑기: 고정한 자리는 그대로 두고 나머지 자리만 새로 채운다 */
export async function drawWords(direction: string) {
  const cur = flow.get();
  if (!cur.category) return;
  const unfixedIds = cur.words.filter((w) => w && !cur.fixed.includes(w.id)).map((w) => w!.id);
  flow.set({ words: cur.words.map((w) => (w && cur.fixed.includes(w.id) ? w : null)), draw: { ...cur.draw, error: null } });
  try {
    const r = await api.draw({ categoryId: cur.category.id, fixedWordIds: cur.fixed, excludeWordIds: unfixedIds, direction });
    const fresh = [...r.words];
    flow.set({
      words: flow.get().words.map((w) => w ?? fresh.shift() ?? null),
      direction,
      draw: {
        error: null,
        empty: false,
        notice: r.notice === 'NARROW_DIRECTION'
          ? '방향에 맞는 단어가 부족해 전체에서 뽑았어요. 방향을 넓혀 보세요.'
          : r.notice === 'DIRECTION_UNAVAILABLE'
            ? '방향성 기능을 잠시 쓸 수 없어 전체에서 뽑았어요.'
            : null,
      },
    });
  } catch (e) {
    if (e instanceof ApiFailure && e.code === 'NOT_ENOUGH_WORDS') flow.set({ draw: { error: null, notice: null, empty: true } });
    else flow.set({ draw: { error: errorMessage(e, '단어를 불러오지 못했습니다'), notice: null, empty: false } });
  }
}

export function useFlow() {
  return useSyncExternalStore(flow.subscribe, flow.get, flow.get);
}
