// 07 공유 피드 (하단 탭) — 정렬 · 반응(하나만, 다시 누르면 취소) · 카드 펼치기는 화면 유지
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Post, ReactionKind } from '../../../../shared/api';
import { AppBar, Chip, Chips, IdeaText, Screen, Skeleton, StateView } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { C, R } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { restart } from '../../lib/nav';

const REACTIONS: { kind: ReactionKind; icon: string; label: string }[] = [
  { kind: 'like', icon: '👍', label: '좋아요' },
  { kind: 'meh', icon: '😐', label: '그저그래요' },
  { kind: 'dislike', icon: '👎', label: '별로예요' },
];

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
};

export default function Feed() {
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async (s: 'latest' | 'popular') => {
    try {
      const r = await api.feed(s);
      setError(null);
      setPosts(r.posts);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(errorMessage(e, '피드를 불러오지 못했습니다'));
    }
  }, []);
  // 탭 화면은 계속 살아 있으므로, 피드 탭으로 올 때마다 새로 받는다 (방금 올린 글이 보이게)
  useFocusEffect(useCallback(() => {
    let alive = true;
    api.feed(sort)
      .then((r) => { if (alive) { setError(null); setPosts(r.posts); setCursor(r.nextCursor); } })
      .catch((e) => alive && setError(errorMessage(e, '피드를 불러오지 못했습니다')));
    return () => { alive = false; };
  }, [sort]));
  const changeSort = (s: 'latest' | 'popular') => {
    if (s === sort) return;
    setPosts(null);
    setSort(s);
  };

  const more = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.feed(sort, cursor);
      setPosts((p) => [...(p ?? []), ...r.posts]);
      setCursor(r.nextCursor);
    } catch {
      showToast('더 불러오지 못했습니다');
    } finally {
      setLoadingMore(false);
    }
  };

  const react = async (post: Post, kind: ReactionKind) => {
    if (post.mine) return showToast('내 글에는 반응할 수 없어요');
    const next = post.myReaction === kind ? null : kind; // 다시 누르면 취소, 다른 걸 누르면 바뀜
    const optimistic = { ...post.counts };
    if (post.myReaction) optimistic[post.myReaction]--;
    if (next) optimistic[next]++;
    const patch = (p: Partial<Post>) => setPosts((list) => list?.map((x) => (x.id === post.id ? { ...x, ...p } : x)) ?? null);
    patch({ myReaction: next, counts: optimistic });
    try {
      const r = await api.react(post.id, next);
      patch({ myReaction: r.myReaction, counts: r.counts });
    } catch (e) {
      patch({ myReaction: post.myReaction, counts: post.counts });
      showToast(errorMessage(e, '반응을 남기지 못했습니다'));
    }
  };

  const tabs = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Chip text="최신순" active={sort === 'latest'} onPress={() => changeSort('latest')} />
      <Chip text="인기순" active={sort === 'popular'} onPress={() => changeSort('popular')} />
    </View>
  );

  const header = <AppBar title="공유 피드" />;
  if (error) return <Screen header={header}><StateView icon="⚠️" message={error} actionLabel="다시 시도" onAction={() => { setError(null); setPosts(null); load(sort); }} /></Screen>;
  if (!posts) return <Screen header={header}>{tabs}<Skeleton height={220} /><Skeleton height={220} /></Screen>;
  return (
    <Screen header={header} bare>
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 20, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center', flexGrow: 1 }}
        ListHeaderComponent={tabs}
        ListEmptyComponent={<StateView icon="📭" message="아직 공유된 아이디어가 없어요" actionLabel="새 아이디어 만들기" onAction={restart} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(sort); setRefreshing(false); }} />}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={C.ink} /> : null}
        renderItem={({ item }) => (
          <FeedCard post={item} open={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} onReact={(k) => react(item, k)} />
        )}
      />
    </Screen>
  );
}

function FeedCard({ post, open, onToggle, onReact }: { post: Post; open: boolean; onToggle: () => void; onReact: (k: ReactionKind) => void }) {
  return (
    <View style={st.card}>
      <Pressable onPress={onToggle} style={{ gap: 10 }} accessibilityRole="button" accessibilityHint="글 전체 펼치기">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={st.avatar}><Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{post.categoryName.slice(0, 1)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{post.nickname}</Text>
            <Text style={{ fontSize: 11, color: C.grey }}>{post.categoryName} · {ago(post.createdAt)}</Text>
          </View>
          {post.mine ? <View style={st.mine}><Text style={{ fontSize: 10, fontWeight: '700', color: C.white }}>내 아이디어</Text></View> : null}
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{post.title}</Text>
        {open
          ? <IdeaText content={post.content} size={14} />
          : <Text style={{ fontSize: 14, lineHeight: 21, color: C.soft }} numberOfLines={2}>{post.content}</Text>}
        <Chips words={post.words} />
      </Pressable>
      <View style={{ height: 1, backgroundColor: C.line }} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {REACTIONS.map((r) => {
          const on = post.myReaction === r.kind;
          return (
            <Pressable
              key={r.kind}
              onPress={() => onReact(r.kind)}
              disabled={post.mine}
              accessibilityRole="button"
              accessibilityLabel={`${r.label} ${post.counts[r.kind]}`}
              accessibilityState={{ selected: on, disabled: post.mine }}
              style={[st.reaction, on && st.reactionOn, post.mine && { opacity: 0.5 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: on ? C.white : C.ink }}>{r.icon} {r.label} {post.counts[r.kind]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderColor: C.line, borderRadius: R.card, padding: 16, gap: 10, backgroundColor: C.white },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  mine: { backgroundColor: C.ink, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  reaction: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: C.white },
  reactionOn: { backgroundColor: C.ink, borderColor: C.ink },
});
