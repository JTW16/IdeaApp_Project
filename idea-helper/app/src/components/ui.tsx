// Figma 화면 설계서의 컴포넌트(AppBar, PrimaryButton, SecondaryButton, CategoryButton, WordCard, WordChip, TextField, Skeleton)
import { type ReactNode, type Ref, useEffect, useState } from 'react';
import {
  ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Word } from '../../../shared/api';
import { C, R } from '../lib/theme';
import { useToast } from '../lib/toast';

/** 한 화면의 틀: 상단바(header) · 본문 · 하단 버튼(footer). bare면 본문을 그대로 채운다 (목록 화면). 아래쪽 여백은 하단 탭 바가 맡는다. */
export function Screen({ children, header, scroll = false, bare = false, footer, scrollRef }: {
  children: ReactNode; header?: ReactNode; scroll?: boolean; bare?: boolean; footer?: ReactNode;
  /** scroll일 때 본문 ScrollView (맨 위로 올리기 등) */
  scrollRef?: Ref<ScrollView>;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {header}
      <View style={s.frame}>
        {bare ? children : scroll ? (
          <ScrollView ref={scrollRef} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        ) : (
          <View style={[s.body, { flex: 1 }]}>{children}</View>
        )}
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

export function AppBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: { label: string; onPress: () => void } }) {
  return (
    <View style={s.appbar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로">
          <Text style={s.back}>‹</Text>
        </Pressable>
      ) : null}
      <Text style={s.appbarTitle} numberOfLines={1}>{title}</Text>
      {right ? (
        <Pressable onPress={right.onPress} style={s.appbarRight} accessibilityRole="button" accessibilityLabel={right.label}>
          <Text style={s.appbarRightText}>{right.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [s.primary, (disabled || loading) && { opacity: 0.35 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, style }: { label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.secondary, disabled && { opacity: 0.35 }, pressed && { backgroundColor: C.chip }, style]}
    >
      <Text style={s.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export function CategoryButton({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name} style={({ pressed }) => [s.category, pressed && { backgroundColor: C.chip }]}>
      <Text style={s.categoryText}>{name}</Text>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

export function Chip({ text, onPress, active }: { text: string; onPress?: () => void; active?: boolean }) {
  const body = <Text style={[s.chipText, active && { color: C.white }]}>{text}</Text>;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text} accessibilityState={{ selected: !!active }} style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { opacity: 0.7 }]}>{body}</Pressable>
  ) : (
    <View style={[s.chip, active && s.chipActive]}>{body}</View>
  );
}

export function Chips({ words }: { words: (Word | string)[] }) {
  return (
    <View style={s.chips}>
      {words.map((w) => <Chip key={typeof w === 'string' ? w : w.id} text={typeof w === 'string' ? w : w.text} />)}
    </View>
  );
}

export function WordCard({ word, fixed, onPin }: { word: Word | null; fixed: boolean; onPin: () => void }) {
  if (!word) return <Skeleton height={76} />;
  return (
    <View style={[s.word, fixed && s.wordFixed]}>
      {fixed ? <View style={s.fixedLabel}><Text style={s.fixedLabelText}>고정됨</Text></View> : null}
      <Text style={s.wordText}>{word.text}</Text>
      <Pressable
        onPress={onPin}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={fixed ? `${word.text} 고정 풀기` : `${word.text} 고정`}
        style={[s.pin, fixed && s.pinOn]}
      >
        <Text style={{ fontSize: 15 }}>📌</Text>
      </Pressable>
    </View>
  );
}

export function TextField({ helper, onHelper, ...props }: TextInputProps & { helper?: string; onHelper?: () => void }) {
  return (
    <View style={s.field}>
      <TextInput placeholderTextColor={C.grey} style={s.fieldInput} {...props} />
      {helper ? (
        <Pressable onPress={onHelper} disabled={!onHelper} hitSlop={8} accessibilityRole={onHelper ? 'button' : 'text'} accessibilityLabel={helper}>
          <Text style={s.fieldHelper}>{helper}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Skeleton({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const [a] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(a, { toValue: 0.5, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ height, borderRadius: R.card, backgroundColor: C.line, opacity: a }, style]} />;
}

/** 빈 상태 · 오류 상태 */
export function StateView({ icon, message, actionLabel, onAction }: { icon: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.state}>
      <Text style={{ fontSize: 36 }}>{icon}</Text>
      <Text style={s.stateText}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={s.stateButton} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={s.stateButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 아이디어 설명을 문장마다 문단으로 나눈다 (AI가 '무엇인지 · 어떻게 다른지 · 누구에게 좋은지' 2~3문장으로 씀) */
export const sentences = (text: string) =>
  text.replace(/([.!?])\s+/g, '$1\n').split('\n').map((s) => s.trim()).filter(Boolean);

export function IdeaText({ content, size = 16 }: { content: string; size?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {sentences(content).map((s, i) => (
        <Text key={i} style={{ fontSize: size, lineHeight: Math.round(size * 1.6), color: C.ink }}>{s}</Text>
      ))}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

/** 앱 전체에 하나만 둔다 (_layout) */
export function Toast() {
  const msg = useToast();
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={s.toastWrap}>
      <View style={s.toast}><Text style={s.toastText}>{msg}</Text></View>
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  frame: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 16 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, gap: 12, backgroundColor: C.white },
  appbar: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, paddingRight: 20, borderBottomWidth: 1, borderBottomColor: C.line, width: '100%', maxWidth: 480, alignSelf: 'center' },
  back: { fontSize: 34, lineHeight: 36, color: C.ink, width: 24, marginTop: -4 },
  appbarTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: C.ink },
  appbarRight: { borderWidth: 1, borderColor: C.ink, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  appbarRightText: { fontSize: 13, fontWeight: '500', color: C.ink },
  primary: { height: 60, borderRadius: R.button, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: C.white, fontSize: 18, fontWeight: '700' },
  secondary: { height: 52, borderRadius: R.secondary, borderWidth: 1.5, borderColor: C.ink, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryText: { color: C.ink, fontSize: 16, fontWeight: '500' },
  category: { height: 72, borderRadius: R.card, borderWidth: 2, borderColor: C.ink, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  categoryText: { fontSize: 18, fontWeight: '700', color: C.ink },
  chevron: { fontSize: 26, color: C.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: R.chip, backgroundColor: C.chip, borderWidth: 1, borderColor: C.line, paddingVertical: 5, paddingHorizontal: 12 },
  chipActive: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { fontSize: 13, fontWeight: '500', color: C.ink },
  word: { height: 76, borderRadius: R.card, borderWidth: 2, borderColor: C.ink, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  wordFixed: { backgroundColor: C.chip, borderWidth: 2.5 },
  wordText: { fontSize: 26, fontWeight: '700', color: C.ink },
  pin: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, borderWidth: 1.2, borderColor: C.line, alignItems: 'center', justifyContent: 'center', opacity: 0.55 },
  pinOn: { backgroundColor: C.ink, borderColor: C.ink, opacity: 1 },
  fixedLabel: { position: 'absolute', left: 16, backgroundColor: C.ink, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  fixedLabelText: { color: C.white, fontSize: 11, fontWeight: '700' },
  field: { height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: C.ink, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 14, gap: 8, backgroundColor: C.white },
  fieldInput: { flex: 1, fontSize: 16, fontWeight: '500', color: C.ink, paddingVertical: 0, outlineStyle: 'none' } as any,
  fieldHelper: { fontSize: 13, color: C.grey },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  stateText: { fontSize: 15, fontWeight: '500', color: C.ink, textAlign: 'center' },
  stateButton: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  stateButtonText: { fontSize: 14, fontWeight: '700', color: C.ink },
  label: { fontSize: 13, fontWeight: '700', color: C.grey },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' },
  toast: { backgroundColor: C.ink, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18, maxWidth: 360 },
  toastText: { color: C.white, fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
