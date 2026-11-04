// 기록 모아보기 (하단 탭) — 기기에 저장한 아이디어 목록. 누르면 홈 탭의 05 아이디어 확정으로 다시 연다. '삭제'는 기기에서만 지운다.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppBar, Chips, Screen, Skeleton, StateView } from '../../components/ui';
import { deleteSaved, listSaved, type SavedIdea } from '../../lib/storage';
import { C, R } from '../../lib/theme';
import { openSaved, restart } from '../../lib/nav';
import { showToast } from '../../lib/toast';

export default function Saved() {
  const [items, setItems] = useState<SavedIdea[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    listSaved().then(setItems).catch(() => setError(true));
  }, []);
  useFocusEffect(load);

  const remove = async (item: SavedIdea) => {
    try {
      await deleteSaved(item.idea.id);
      setItems((list) => list?.filter((s) => s.idea.id !== item.idea.id) ?? null);
      showToast('기록에서 지웠어요');
    } catch {
      showToast('지우지 못했습니다. 다시 시도해 주세요.');
    }
  };

  let body;
  if (error) body = <StateView icon="⚠️" message="기록을 불러오지 못했습니다" actionLabel="다시 시도" onAction={load} />;
  else if (!items) body = <><Skeleton height={110} /><Skeleton height={110} /></>;
  else if (!items.length) body = <StateView icon="🗒️" message="아직 저장한 아이디어가 없어요" actionLabel="새 아이디어 만들기" onAction={restart} />;
  else {
    // '삭제'를 카드(버튼) 안에 넣으면 웹에서 <button> 안에 <button>이 되어 오류 → 카드 위에 겹쳐 놓은 형제로 둔다
    body = items.map((item) => (
      <View key={item.idea.id}>
        <Pressable
          onPress={() => openSaved(item.idea, item.recipe)}
          accessibilityRole="button"
          accessibilityLabel={item.idea.title}
          style={({ pressed }) => ({ borderWidth: 1.5, borderColor: C.line, borderRadius: R.card, padding: 16, gap: 8, backgroundColor: pressed ? C.chip : C.white })}
        >
          <Text style={{ fontSize: 12, color: C.grey, paddingRight: 40 }}>{item.idea.categoryName} · {new Date(item.savedAt).toLocaleDateString('ko-KR')}</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{item.idea.title}</Text>
          <Text style={{ fontSize: 14, color: C.soft }} numberOfLines={2}>{item.idea.content}</Text>
          <Chips words={item.idea.words} />
        </Pressable>
        <Pressable
          onPress={() => remove(item)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${item.idea.title} 삭제`}
          style={{ position: 'absolute', top: 16, right: 16 }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>삭제</Text>
        </Pressable>
      </View>
    ));
  }

  return <Screen header={<AppBar title="기록" />} scroll>{body}</Screen>;
}
