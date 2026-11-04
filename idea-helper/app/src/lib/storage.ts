// 기기에 저장한 아이디어 (웹 미리보기용: localStorage). 휴대폰에서는 storage.native.ts(SQLite)가 쓰인다.
import type { Idea, Recipe } from '../../../shared/api';

export interface SavedIdea {
  idea: Idea;
  recipe: Recipe | null;
  savedAt: string;
}

const KEY = 'idea-helper/saved';
const read = (): SavedIdea[] => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};

export async function saveIdea(idea: Idea, recipe: Recipe | null): Promise<'saved' | 'updated'> {
  const list = read();
  const i = list.findIndex((s) => s.idea.id === idea.id);
  const item = { idea, recipe: recipe ?? list[i]?.recipe ?? null, savedAt: new Date().toISOString() };
  if (i >= 0) list[i] = item;
  else list.unshift(item);
  globalThis.localStorage?.setItem(KEY, JSON.stringify(list));
  return i >= 0 ? 'updated' : 'saved';
}

export async function deleteSaved(ideaId: number): Promise<void> {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(read().filter((s) => s.idea.id !== ideaId)));
}

export async function listSaved(): Promise<SavedIdea[]> {
  return read().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
