// 01-1 나만의 카테고리 추가 — 이름 입력 → DB 연관 단어 미리보기 → '추가하고 시작' → 02 (뒤로 → 01)
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { CategoryPreviewResponse } from '../../../../../shared/api';
import { AppBar, Chips, Label, PrimaryButton, Screen, SecondaryButton, StateView, TextField } from '../../../components/ui';
import { api, errorMessage } from '../../../lib/api';
import { flow } from '../../../lib/flow';
import { C } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

export default function AddCategory() {
  const [name, setName] = useState('');
  // 마지막으로 받은 미리보기 결과 (어떤 이름에 대한 결과인지 함께 기억)
  const [result, setResult] = useState<{ name: string; preview?: CategoryPreviewResponse; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const length = [...trimmed].length;
  const valid = length >= 2 && length <= 20;
  const current = result?.name === trimmed ? result : null;
  const loading = valid && !current;
  const preview = current?.preview ?? null;
  const error = current?.error ?? null;

  // 입력을 멈추면(0.5초) 연관 단어를 찾아 미리 보여준다
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const t = setTimeout(() => {
      api.previewCategory(trimmed)
        .then((p) => alive && setResult({ name: trimmed, preview: p }))
        .catch((e) => alive && setResult({ name: trimmed, error: errorMessage(e, '연관 단어를 불러오지 못했습니다') }));
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [trimmed, valid]);

  const start = (c: { id: number; name: string }) => {
    flow.start(c);
    router.replace({ pathname: '/words', params: { categoryId: String(c.id), name: c.name } });
  };

  const create = async () => {
    setSaving(true);
    try {
      const r = await api.createCategory(trimmed);
      if (r.existed) showToast('이미 있는 카테고리로 시작할게요');
      start(r.category);
    } catch (e) {
      showToast(errorMessage(e, '카테고리를 추가하지 못했습니다'));
    } finally {
      setSaving(false);
    }
  };

  let matched;
  if (loading) matched = <ActivityIndicator color={C.ink} style={{ alignSelf: 'flex-start' }} />;
  else if (error) matched = <StateView icon="⚠️" message={error} />;
  else if (preview?.duplicate) {
    matched = (
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>이미 있는 카테고리예요</Text>
        <SecondaryButton label={`'${preview.duplicate.name}'로 시작`} onPress={() => start(preview.duplicate!)} />
      </View>
    );
  } else if (preview) {
    matched = (
      <View style={{ gap: 8 }}>
        {preview.matchedCount === 0 ? (
          <Text style={{ fontSize: 14, color: C.red }}>어떤 분야인지 알기 어려운 이름이에요. 더 구체적으로 입력해 주세요.</Text>
        ) : preview.matchedCount < 10 ? (
          <Text style={{ fontSize: 14, color: C.red }}>연관 단어가 부족해요 ({preview.matchedCount}개). 이름을 바꿔 입력해 주세요.</Text>
        ) : null}
        <Chips words={preview.examples} />
      </View>
    );
  }

  return (
    <Screen header={<AppBar title="나만의 카테고리" onBack={() => router.back()} />}
        scroll
        footer={<PrimaryButton label="추가하고 시작" onPress={create} disabled={!preview?.canCreate} loading={saving} />}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>어떤 카테고리를 만들까요?</Text>
        <Text style={{ fontSize: 14, color: C.grey }}>입력한 이름과 연관된 단어를 DB에서 찾아 연결해요.</Text>
        <View style={{ gap: 8 }}>
          <Label>카테고리 이름</Label>
          <TextField value={name} onChangeText={setName} placeholder="예: 캠핑 요리" maxLength={20} helper={`${length}/20`} autoFocus />
        </View>
        {length >= 2 ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Label>연관 단어 미리보기</Label>
              {preview && !preview.duplicate && preview.matchedCount > 0 ? <Text style={{ fontSize: 12, fontWeight: '500', color: C.greenText }}>DB에서 {preview.matchedCount}개 찾음</Text> : null}
            </View>
            {matched}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: C.chip, borderRadius: 12, padding: 14 }}>
          <Text>👥</Text>
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: C.ink }}>
            추가한 카테고리는 ‘다른 사용자가 만든 카테고리’에 올라가 누구나 쓸 수 있어요. (이름만 공개)
          </Text>
        </View>
      </Screen>
  );
}
