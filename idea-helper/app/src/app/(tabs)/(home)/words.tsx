// 02 랜덤 단어 3개 — 단어 고정(최대 2개) · 방향성 설정 · 다시 뽑기(화면 유지), '창조' → 03, 뒤로 · 홈 → 01
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AppBar, Label, PrimaryButton, Screen, SecondaryButton, StateView, TextField, WordCard } from '../../../components/ui';
import { drawWords, flow, useFlow } from '../../../lib/flow';
import { goBack, homeButton } from '../../../lib/nav';
import { C } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

export default function RandomWords() {
  const params = useLocalSearchParams<{ categoryId: string; name: string }>();
  const st = useFlow();
  const [input, setInput] = useState(st.direction);
  const { error, notice, empty } = st.draw;

  // 웹에서 새로고침했을 때 등 흐름 상태가 없으면 주소의 카테고리로 시작
  useEffect(() => {
    const id = Number(params.categoryId);
    if (id && flow.get().category?.id !== id) flow.start({ id, name: params.name ?? '' });
  }, [params.categoryId, params.name]);

  // 처음 들어오면 단어 3개를 뽑는다 (03에서 '취소'로 돌아오면 그대로 유지)
  useEffect(() => {
    const cur = flow.get();
    if (cur.category && cur.words.every((w) => !w)) drawWords(cur.direction);
  }, [st.category?.id]);

  const togglePin = (id: number) => {
    const { fixed } = flow.get();
    if (fixed.includes(id)) flow.set({ fixed: fixed.filter((f) => f !== id) });
    else if (fixed.length >= 2) showToast('고정은 2개까지 할 수 있어요');
    else flow.set({ fixed: [...fixed, id] });
  };

  const applyDirection = (text: string) => {
    const d = text.replace(/\s+/g, ' ').trim();
    if ([...d].length > 50) return showToast('방향성은 50자 이내로 입력해 주세요');
    if (d !== flow.get().direction) drawWords(d);
  };

  const create = () => {
    flow.set({ idea: null, recipe: null });
    router.push('/preparing');
  };

  // 카테고리를 다시 고르면 고정 · 방향성은 초기화된다 (01에서 flow.start)
  const header = <AppBar title="랜덤 단어" onBack={goBack} right={homeButton} />;

  if (empty) {
    return <Screen header={header}><StateView icon="📭" message="이 카테고리에 단어가 부족합니다" actionLabel="다른 카테고리 고르기" onAction={goBack} /></Screen>;
  }
  if (error && st.words.every((w) => !w)) {
    return <Screen header={header}><StateView icon="⚠️" message={error} actionLabel="다시 시도" onAction={() => drawWords(st.direction)} /></Screen>;
  }

  const ready = st.words.every(Boolean);
  const busy = !ready && !error; // 뽑는 중
  return (
    <Screen
      header={header}
      scroll
      footer={
        <>
          <SecondaryButton label={st.fixed.length ? '다시 뽑기 (고정 제외)' : '다시 뽑기'} onPress={() => drawWords(st.direction)} disabled={busy} />
          <PrimaryButton label="창조" onPress={create} disabled={!ready} />
        </>
      }
    >
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, color: C.grey }}>선택한 카테고리</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{st.category?.name ?? params.name}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Label>🧭 방향성 (선택)</Label>
        <TextField
          value={input}
          onChangeText={setInput}
          placeholder="예: 매콤한 요리, 튀김 요리"
          returnKeyType="done"
          onSubmitEditing={() => applyDirection(input)}
          onBlur={() => applyDirection(input)}
          helper={input ? '지우기' : undefined}
          onHelper={() => { setInput(''); applyDirection(''); }}
        />
        {st.direction ? <Text style={{ fontSize: 12, color: C.greenText }}>‘{st.direction}’ 방향으로 뽑고 있어요</Text> : null}
        {notice ? <Text style={{ fontSize: 12, color: C.red }}>{notice}</Text> : null}
      </View>
      <View style={{ gap: 8 }}>
        {st.words.map((w, i) => (
          <WordCard key={w?.id ?? `slot-${i}`} word={w} fixed={!!w && st.fixed.includes(w.id)} onPin={() => w && togglePin(w.id)} />
        ))}
      </View>
      {error ? <Text style={{ fontSize: 13, color: C.red }}>{error}</Text> : null}
      <Text style={{ fontSize: 12, color: C.grey }}>📌를 누르면 그 단어는 다시 뽑기에서 빠져요 (최대 2개).</Text>
    </Screen>
  );
}
