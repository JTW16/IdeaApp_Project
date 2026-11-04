// 04 결과 — 카드를 눌러 고른 아이디어를 '확정' → 05, '다시 조합하기' → 같은 단어 3개로 다른 아이디어(맨 위에 추가, 이전 결과는 아래로),
// '다시 뽑기' · 뒤로 → 02 (단어 그대로), 홈 → 01
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { Idea } from '../../../../../shared/api';
import { AppBar, Chips, IdeaText, PrimaryButton, Screen, SecondaryButton, StateView } from '../../../components/ui';
import { api, errorMessage } from '../../../lib/api';
import { flow, useFlow } from '../../../lib/flow';
import { goBack, homeButton } from '../../../lib/nav';
import { C, R } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

export default function Result() {
  const { idea, fromCache, results } = useFlow();
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  // 화면을 떠나면(다시 뽑기 · 뒤로 · 홈) 만들던 조합도 멈춘다
  useEffect(() => () => ctrl.current?.abort(), []);
  const reroll = goBack;
  const header = <AppBar title="결과" onBack={reroll} right={homeButton} />;

  if (!idea) {
    return (
      <Screen header={header}><StateView icon="📄" message="아이디어 결과가 비어 있습니다" actionLabel="다시 뽑기" onAction={reroll} /></Screen>
    );
  }
  const list = results.length ? results : [{ idea, fromCache }];
  const many = list.length > 1;

  const recombine = async () => {
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    scroll.current?.scrollTo({ y: 0, animated: true });
    try {
      const r = await api.recombine(idea.id, c.signal);
      const cur = flow.get();
      const prev = cur.results.length ? cur.results : cur.idea ? [{ idea: cur.idea, fromCache: cur.fromCache }] : [];
      // 새 조합을 맨 위에 두고 바로 고른 상태로
      flow.set({ results: [{ idea: r.idea, fromCache: false }, ...prev], idea: r.idea, recipe: null });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') showToast(errorMessage(e, '다시 조합하지 못했습니다'));
    } finally {
      if (ctrl.current === c) setBusy(false);
    }
  };
  const cancel = () => {
    ctrl.current?.abort();
    ctrl.current = null;
    setBusy(false);
  };
  const pick = (it: Idea) => {
    if (it.id !== idea.id) flow.set({ idea: it, recipe: null });
  };

  return (
    <Screen header={header}
        scroll
        scrollRef={scroll}
        footer={
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <SecondaryButton label="다시 뽑기" onPress={reroll} style={{ flex: 1 }} />
              <SecondaryButton label={busy ? '조합하는 중…' : '다시 조합하기'} onPress={recombine} disabled={busy} style={{ flex: 1 }} />
            </View>
            <PrimaryButton label="확정" onPress={() => router.push('/confirm')} disabled={busy} />
          </>
        }
      >
        <Chips words={idea.words} />
        {idea.direction ? <Text style={{ fontSize: 13, color: C.grey }}>방향성: {idea.direction}</Text> : null}
        {many ? <Text style={{ fontSize: 13, color: C.grey }}>확정할 아이디어를 눌러 고르세요 (새 조합이 맨 위)</Text> : null}
        {busy ? <RecombiningCard no={list.length + 1} onCancel={cancel} /> : null}
        {list.map((it, i) => {
          const selected = many && it.idea.id === idea.id;
          const card = (
            <View style={{ borderWidth: selected ? 2 : 1.5, borderColor: selected ? C.ink : C.line, borderRadius: R.card, padding: 20, gap: 14 }}>
              {many ? (
                <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? C.ink : C.grey }}>
                  {`조합 ${list.length - i}${selected ? ' · ✓ 고름' : ''}`}
                </Text>
              ) : null}
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{it.idea.title}</Text>
              <IdeaText content={it.idea.content} />
            </View>
          );
          return (
            <View key={it.idea.id} style={{ gap: 8 }}>
              {many ? (
                <Pressable onPress={() => pick(it.idea)} accessibilityRole="button" accessibilityState={{ selected }}>{card}</Pressable>
              ) : card}
              {it.fromCache ? <Text style={{ fontSize: 12, color: C.greenText }}>저장된 조합이라 AI를 부르지 않고 바로 보여드렸어요</Text> : null}
            </View>
          );
        })}
      </Screen>
  );
}

const STEPS = ['세 단어를 다시 살펴보는 중', '앞의 아이디어와 다른 쓰임을 찾는 중', '새 아이디어를 다듬는 중'];

/** '다시 조합하기' 중: 결과 카드와 같은 자리 · 모양으로, 진행 문구가 바뀌고 '취소'로 멈출 수 있다 */
function RecombiningCard({ no, onCancel }: { no: number; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 1200);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: C.ink, borderRadius: R.card, padding: 20, gap: 14, backgroundColor: C.chip }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>{`조합 ${no} · 만드는 중`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ActivityIndicator color={C.ink} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{STEPS[step]}…</Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 20, color: C.soft }}>같은 단어 3개를 다른 방식으로 엮고 있어요. 다 되면 이 자리에 나타나요.</Text>
      <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" style={{ alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.grey }}>취소</Text>
      </Pressable>
    </View>
  );
}
