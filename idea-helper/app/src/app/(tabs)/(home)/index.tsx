// 01 카테고리 선택 — 기본 카테고리 / 다른 사용자가 만든 카테고리 → 02, '+ 나만의 카테고리 추가' → 01-1
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import type { CategoriesResponse } from '../../../../../shared/api';
import { AppBar, CategoryButton, Chip, Label, Screen, SecondaryButton, Skeleton, StateView, s } from '../../../components/ui';
import { api, errorMessage } from '../../../lib/api';
import { flow } from '../../../lib/flow';

export default function CategorySelect() {
  const [data, setData] = useState<CategoriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.categories().then(setData).catch((e) => setError(errorMessage(e, '카테고리를 불러오지 못했습니다')));
  }, []);
  useFocusEffect(load); // 다른 화면에서 돌아올 때마다 '다른 사용자가 만든 카테고리'를 새로 받는다

  const open = (c: { id: number; name: string }) => {
    flow.start({ id: c.id, name: c.name });
    router.push({ pathname: '/words', params: { categoryId: String(c.id), name: c.name } });
  };
  const add = () => router.push('/category-new');

  let body;
  if (error) body = <StateView icon="⚠️" message={error} actionLabel="다시 시도" onAction={load} />;
  else if (!data) {
    body = (
      <>
        <Text style={title}>어떤 분야로 발상할까요?</Text>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={72} />)}
      </>
    );
  } else if (data.defaults.length + data.userMade.length === 0) {
    body = <StateView icon="🗂️" message="준비된 카테고리가 없습니다" actionLabel="+ 나만의 카테고리 추가" onAction={add} />;
  } else {
    body = (
      <>
        <Text style={title}>어떤 분야로 발상할까요?</Text>
        <Label>많이 쓰는 카테고리</Label>
        {data.defaults.map((c) => <CategoryButton key={c.id} name={c.name} onPress={() => open(c)} />)}
        {data.userMade.length ? (
          <>
            <Label>다른 사용자가 만든 카테고리</Label>
            <View style={s.chips}>
              {data.userMade.map((c) => <Chip key={c.id} text={c.name} onPress={() => open(c)} />)}
            </View>
          </>
        ) : null}
        <SecondaryButton label="+ 나만의 카테고리 추가" onPress={add} />
      </>
    );
  }

  return (
    <Screen header={<AppBar title="카테고리 선택" />} scroll>{body}</Screen>
  );
}

const title = { fontSize: 20, fontWeight: '700' as const, color: '#1F1F24' };
