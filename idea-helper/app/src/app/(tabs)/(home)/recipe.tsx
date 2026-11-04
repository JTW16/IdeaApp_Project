// 05-1 만드는 법 — '공유하기' → 06, 뒤로 → 05, 홈 → 01
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AppBar, Chips, PrimaryButton, Screen, Skeleton, StateView } from '../../../components/ui';
import { ApiFailure, api, errorMessage } from '../../../lib/api';
import { flow, useFlow } from '../../../lib/flow';
import { goBack, homeButton } from '../../../lib/nav';
import { C } from '../../../lib/theme';

export default function RecipeScreen() {
  const { idea, recipe } = useFlow();
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // 저장된 만드는 법이 있으면 서버가 그대로 주고, 없을 때만 AI가 만든다
  useEffect(() => {
    const cur = flow.get();
    if (!cur.idea || cur.recipe?.ideaId === cur.idea.id) return;
    let alive = true;
    api.recipe(cur.idea.id)
      .then((r) => flow.set({ recipe: r.recipe }))
      .catch((e) => {
        if (!alive) return;
        // 기록에만 남아 있고 서버에서는 지워진 아이디어 (서버 DB를 초기화한 경우 등)
        if (e instanceof ApiFailure && e.code === 'IDEA_NOT_FOUND') setGone(true);
        else setError(errorMessage(e, '만드는 법을 불러오지 못했습니다'));
      });
    return () => { alive = false; };
  }, [attempt]);

  const back = goBack;
  const ready = recipe && idea && recipe.ideaId === idea.id;

  let body;
  if (!idea) body = <StateView icon="📄" message="아이디어가 없습니다" actionLabel="돌아가기" onAction={back} />;
  else if (gone) body = <StateView icon="🗑️" message={'서버에서 지워진 아이디어예요.\n같은 단어로 새로 만들어 보세요.'} actionLabel="돌아가기" onAction={back} />;
  else if (error) body = <StateView icon="⚠️" message={error} actionLabel="다시 시도" onAction={() => { setError(null); setAttempt((n) => n + 1); }} />;
  else if (!ready) {
    body = (
      <>
        <Text style={{ fontSize: 13, color: C.grey }}>만드는 법을 정리하는 중이에요</Text>
        <Skeleton height={28} style={{ width: 220 }} />
        <Skeleton height={120} />
        <Skeleton height={160} />
      </>
    );
  } else if (!recipe.feasible) {
    body = <StateView icon="🤔" message="만드는 법을 알려주기 어려운 아이디어예요" actionLabel="아이디어로 돌아가기" onAction={back} />;
  } else {
    const food = recipe.kind === 'food';
    body = (
      <>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, color: C.grey }}>확정한 아이디어</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>{idea.title}</Text>
        </View>
        <Chips words={[`⏱ ${recipe.summary.time}`, `난이도 ${recipe.summary.difficulty}`, recipe.summary.amount]} />
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{food ? '재료' : '준비물'}</Text>
          {recipe.ingredients.map((x, i) => <Text key={i} style={{ fontSize: 14, lineHeight: 22, color: C.soft }}>· {x}</Text>)}
        </View>
        <View style={{ height: 1, backgroundColor: C.line }} />
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{food ? '만드는 순서' : '실행 단계'}</Text>
          {recipe.steps.map((x, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: C.ink }}>{x}</Text>
            </View>
          ))}
        </View>
      </>
    );
  }

  return (
    <Screen header={<AppBar title="만드는 법" onBack={back} right={homeButton} />} scroll footer={ready && recipe.feasible ? <PrimaryButton label="공유하기" onPress={() => router.push('/share')} /> : undefined}>
        {body}
      </Screen>
  );
}
