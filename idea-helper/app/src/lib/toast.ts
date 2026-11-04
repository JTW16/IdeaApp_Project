import { useSyncExternalStore } from 'react';

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string, ms = 2200) {
  message = text;
  emit();
  clearTimeout(timer);
  timer = setTimeout(() => {
    message = null;
    emit();
  }, ms);
}

export function useToast() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => message,
    () => message,
  );
}
