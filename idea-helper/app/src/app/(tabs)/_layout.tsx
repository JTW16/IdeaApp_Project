// 하단 네비게이션 바: 홈(01 → 아이디어 만들기 흐름) · 피드(07) · 기록. 모든 화면에서 보인다.
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '../../lib/theme';

const icon = (emoji: string) => function TabIcon({ focused }: { focused: boolean }) {
  // 줄 높이를 정해 두지 않으면 이모지가 위아래로 커져서 아래 글씨(홈 · 피드 · 기록)가 잘린다
  return <Text style={{ fontSize: 20, lineHeight: 24, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.grey,
        // 탭 버튼 안쪽에 위아래 5px 여백이 고정으로 붙는다 → 아이콘(28) + 글씨(16) + 여백(10) = 54px 이상이 들어가야 글씨가 안 잘림
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.line, height: 66, paddingTop: 4, paddingBottom: 6 },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
        // 창 너비가 넓으면 기본값이 '아이콘 옆 글씨'로 바뀐다 → PC 브라우저의 휴대폰 틀 안에서도 휴대폰처럼 '아이콘 아래 글씨'
        tabBarLabelPosition: 'below-icon',
        sceneStyle: { backgroundColor: C.white },
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: '홈', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="feed" options={{ title: '피드', tabBarIcon: icon('📣') }} />
      <Tabs.Screen name="saved" options={{ title: '기록', tabBarIcon: icon('🗒️') }} />
    </Tabs>
  );
}
