// 06 공유하기 시트 (탭 바까지 덮음) — '링크 복사' → 시트 닫힘(토스트), '피드에 올리기' → 피드 탭, '닫기' · 바깥 → 들어온 화면
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryButton } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useFlow } from '../lib/flow';
import { C } from '../lib/theme';
import { showToast } from '../lib/toast';

export default function ShareSheet() {
  const { idea } = useFlow();
  const [busy, setBusy] = useState<'link' | 'feed' | null>(null);
  const close = () => router.back();

  const copyLink = async () => {
    if (!idea) return;
    setBusy('link');
    try {
      const r = await api.shareLink(idea.id);
      await Clipboard.setStringAsync(r.url);
      showToast('링크를 복사했어요');
      close();
    } catch (e) {
      showToast(errorMessage(e, '링크를 만들지 못했습니다'));
    } finally {
      setBusy(null);
    }
  };

  const postToFeed = async () => {
    if (!idea) return;
    setBusy('feed');
    try {
      const r = await api.post(idea.id);
      if (r.alreadyPosted) showToast('이미 피드에 올린 아이디어예요');
      // 시트를 닫고 하단 탭의 피드로
      router.back();
      router.navigate('/feed');
    } catch (e) {
      showToast(errorMessage(e, '피드에 올리지 못했습니다. 다시 시도해 주세요.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={st.wrap}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="닫기" />
      <SafeAreaView edges={['bottom']} style={st.sheet}>
        <View style={st.handle} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>아이디어 공유</Text>
        {idea ? (
          <View style={{ backgroundColor: C.chip, borderRadius: 12, padding: 14, gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{idea.title}</Text>
            <Text style={{ fontSize: 12, color: C.grey }}>{idea.words.map((w) => w.text).join(' · ')}</Text>
          </View>
        ) : null}
        <Option icon="🔗" title="링크 복사" sub="앱이 없는 사람도 웹에서 볼 수 있어요" onPress={copyLink} loading={busy === 'link'} disabled={!!busy || !idea} />
        <Option icon="📣" title="피드에 올리기" sub="다른 사용자들이 보고 평가해요 (익명)" onPress={postToFeed} loading={busy === 'feed'} disabled={!!busy || !idea} />
        <SecondaryButton label="닫기" onPress={close} />
      </SafeAreaView>
    </View>
  );
}

function Option({ icon, title, sub, onPress, loading, disabled }: { icon: string; title: string; sub: string; onPress: () => void; loading: boolean; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [st.option, pressed && { backgroundColor: C.chip }, disabled && !loading && { opacity: 0.5 }]}>
      <View style={st.optionIcon}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: C.grey }}>{sub}</Text>
      </View>
      {loading ? <ActivityIndicator color={C.ink} /> : <Text style={{ fontSize: 20, color: C.grey }}>›</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.dim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 14, width: '100%', maxWidth: 480, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, paddingVertical: 12, paddingLeft: 12, paddingRight: 14 },
  optionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
});
