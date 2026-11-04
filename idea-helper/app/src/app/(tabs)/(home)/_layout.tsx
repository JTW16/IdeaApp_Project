// 홈 탭 안의 화면 흐름: 01 → 01-1 / 02 → 03 → 04 → 05 → 05-1
import { Stack } from 'expo-router';
import { C } from '../../../lib/theme';

// 웹에서 /words 등을 새로고침해도 01이 아래에 깔리도록 (뒤로 가기가 01로)
export const unstable_settings = { anchor: 'index' };

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.white } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="category-new" />
      <Stack.Screen name="words" />
      <Stack.Screen name="preparing" options={{ gestureEnabled: false }} />
      <Stack.Screen name="result" />
      <Stack.Screen name="confirm" />
      <Stack.Screen name="recipe" />
    </Stack>
  );
}
