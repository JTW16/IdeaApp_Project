import { router } from 'expo-router';
import type { Idea, Recipe } from '../../../shared/api';
import { flow } from './flow';

/** '홈' 버튼 · '새 아이디어 시작' → 01 카테고리 선택 (홈 탭으로 가서 쌓인 화면을 모두 닫는다) */
export function restart() {
  router.navigate('/');
}

/** 상단 바의 홈 버튼 */
export const homeButton = { label: '홈', onPress: restart };

/** 기록에서 저장한 아이디어를 05 아이디어 확정으로 다시 연다 (홈 탭: 01 위에 05) */
export function openSaved(idea: Idea, recipe: Recipe | null) {
  flow.set({ idea, recipe, category: { id: idea.categoryId, name: idea.categoryName }, words: idea.words, fixed: [], direction: idea.direction, fromCache: true, results: [] });
  router.navigate('/');
  router.push('/confirm');
}

/** 뒤로 갈 화면이 없으면(웹 새로고침 등) 01로 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/');
}
