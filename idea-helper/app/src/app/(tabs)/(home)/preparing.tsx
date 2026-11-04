// 03 결과 준비 — 같은 조합이 DB에 있으면 바로, 없으면 AI가 생성. 완료되면 자동으로 04, '취소' → 02 (고정 유지)
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AppBar, Chips, Screen, SecondaryButton, StateView } from '../../../components/ui';
import { api, errorMessage } from '../../../lib/api';
import { flow, useFlow } from '../../../lib/flow';
import { C } from '../../../lib/theme';

export default function Preparing() {
  const st = useFlow();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const words = st.words.filter((w) => w !== null);

  useEffect(() => {
    const cur = flow.get();
    const ws = cur.words.filter((w) => w !== null);
    if (!cur.category || ws.length !== 3) {
      router.back();
      return;
    }
    const c = new AbortController();
    ctrl.current = c;
    api.createIdea({ categoryId: cur.category.id, wordIds: ws.map((w) => w.id), direction: cur.direction }, c.signal)
      .then((r) => {
        flow.set({ idea: r.idea, fromCache: r.fromCache, results: [{ idea: r.idea, fromCache: r.fromCache }], recipe: null });
        router.replace('/result');
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setError(errorMessage(e, '아이디어를 만들지 못했습니다'));
      });
    return () => c.abort();
  }, [attempt]);

  const cancel = () => {
    ctrl.current?.abort();
    router.back();
  };
  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  return (
    <Screen header={<AppBar title="결과 준비" />} footer={<SecondaryButton label="취소" onPress={cancel} />}>
      {error ? (
        <StateView icon="⚠️" message={error} actionLabel="다시 시도" onAction={retry} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
          <Chips words={words} />
          <ActivityIndicator size="large" color={C.ink} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>아이디어를 만드는 중입니다</Text>
        </View>
      )}
    </Screen>
  );
}
