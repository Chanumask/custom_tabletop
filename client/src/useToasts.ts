import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'info' | 'error';

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

const TOAST_LIFETIME_MS = 4500;
const MAX_TOASTS = 3;

/**
 * Short-lived on-screen notices — how a rejected action (a taken color, a
 * link that isn't audio, a video that can't be embedded, ...) tells the
 * player *why* nothing happened instead of failing silently into the
 * console. Newest last, capped, each auto-dismissing.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, text, kind }].slice(-MAX_TOASTS));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_LIFETIME_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return { toasts, toast, dismiss };
}
