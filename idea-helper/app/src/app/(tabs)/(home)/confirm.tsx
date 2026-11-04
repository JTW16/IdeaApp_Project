// 05 아이디어 확정 — '저장' (화면 유지 · 토스트), '진짜 만드는 법' → 05-1, '공유' → 06, '새 아이디어 시작' · 홈 → 01, 뒤로 → 04
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppBar, Chips, IdeaText, Label, PrimaryButton, Screen, SecondaryButton, StateView } from '../../../components/ui';
import { useFlow } from '../../../lib/flow';
import { goBack, homeButton, restart } from '../../../lib/nav';
import { saveIdea } from '../../../lib/storage';
import { C, R } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

export default function Confirm() {
  const { idea, recipe } = useFlow();
  const [saving, setSaving] = useState(false);

  if (!idea) {
    return (
      <Screen header={<AppBar title="아이디어 확정" onBack={goBack} />}><StateView icon="📄" message="확정한 아이디어가 없습니다" actionLabel="새 아이디어 시작" onAction={restart} /></Screen>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const r = await saveIdea(idea, recipe);
      showToast(r === 'saved' ? '저장했어요' : '이미 저장한 아이디어예요');
    } catch {
      showToast('저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<AppBar title="아이디어 확정" onBack={goBack} right={homeButton} />}
        scroll
        footer={
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SecondaryButton label="새 아이디어 시작" onPress={restart} style={{ flex: 1 }} />
              <SecondaryButton label="공유" onPress={() => router.push('/share')} style={{ flex: 1 }} />
            </View>
            <PrimaryButton label="저장" onPress={save} loading={saving} />
          </>
        }
      >
        <View style={{ borderWidth: 1.5, borderColor: C.line, borderRadius: R.card, padding: 20, gap: 14 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>{idea.title}</Text>
          <IdeaText content={idea.content} />
        </View>
        <View style={{ gap: 8 }}>
          <Label>사용한 단어</Label>
          <Chips words={idea.words} />
        </View>
        <Pressable
          onPress={() => router.push('/recipe')}
          accessibilityRole="button"
          accessibilityLabel="진짜 만드는 법 · 레시피"
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: C.ink, borderRadius: R.card,
            paddingVertical: 14, paddingLeft: 14, paddingRight: 16, backgroundColor: pressed ? C.chip : C.white,
          })}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Text>📖</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>진짜 만드는 법 · 레시피</Text>
            <Text style={{ fontSize: 12, color: C.grey }}>재료와 만드는 순서를 알려줘요</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.grey }}>›</Text>
        </Pressable>
      </Screen>
  );
}
