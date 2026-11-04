import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Toast } from '../components/ui';
import { api } from '../lib/api';

// 웹: 한글이 글자 단위로 줄바꿈되어 '얇/은', '디/저트'처럼 단어가 잘리던 것을 단어(띄어쓰기) 단위로.
// word-break는 상속되는 속성이고 react-native-web이 따로 정하지 않아서 한 번만 넣으면 모든 화면에 적용된다.
// (휴대폰 앱에서는 iOS가 Text의 lineBreakStrategyIOS="hangul-word"로 같은 효과 — 지금 시연은 웹이라 넣지 않음)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'body { word-break: keep-all; }';
  document.head.appendChild(style);
}

// 웹 시연: PC 브라우저 창이 넓으면 가운데에 휴대폰 크기(390×844) 화면으로 보여 준다 (개발자 도구 없이).
// 탭 바 · 공유 시트 · 토스트까지 모두 이 틀 안에 들어간다. 창이 좁으면(휴대폰 · 개발자 도구 모바일 모드) 틀 없이 꽉 채운다.
const PHONE = { width: 390, height: 844 };
const FRAME_MIN_WIDTH = 600;

// 맨 바깥: 하단 탭 전체(tabs) 위에 06 공유하기 시트를 띄운다 (시트의 어두운 배경이 탭 바까지 덮도록)
export default function RootLayout() {
  useEffect(() => {
    // 00 앱 처음 실행: 익명 토큰을 미리 받아 둔다 (실패하면 첫 요청 때 다시 시도)
    api.ready().catch(() => {});
  }, []);
  const win = useWindowDimensions();
  const framed = Platform.OS === 'web' && win.width >= FRAME_MIN_WIDTH;

  const app = (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="share"
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
      </Stack>
      <Toast />
    </>
  );
  if (!framed) return app;
  return (
    <View style={st.desk}>
      <View style={[st.phone, { height: Math.min(PHONE.height, win.height - 48) }]}>{app}</View>
    </View>
  );
}

const st = StyleSheet.create({
  desk: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9E9EE' },
  phone: { width: PHONE.width, borderRadius: 28, overflow: 'hidden', backgroundColor: '#FFFFFF', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' },
});
