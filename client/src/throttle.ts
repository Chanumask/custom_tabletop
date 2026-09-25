/**
 * Sends at most once per `intervalMs` while something moves (a dragged mini
 * or die): the first call goes out at once, later ones as the latest value
 * once the interval has passed, and `flush` sends what's pending right away
 * (on letting go) — so the final position is never lost.
 */
export interface Throttled<T> {
  call(value: T): void;
  flush(): void;
  cancel(): void;
}

export function throttle<T>(
  send: (value: T) => void,
  intervalMs: number,
  now: () => number = Date.now,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
  unschedule: (handle: unknown) => void = (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
): Throttled<T> {
  let lastSent = -Infinity;
  let pending: { value: T } | null = null;
  let timer: unknown = null;

  const sendPending = () => {
    timer = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    lastSent = now();
    send(value);
  };

  return {
    call(value) {
      pending = { value };
      const wait = lastSent + intervalMs - now();
      if (wait <= 0) {
        if (timer !== null) unschedule(timer);
        sendPending();
      } else if (timer === null) {
        timer = schedule(sendPending, wait);
      }
    },
    flush() {
      if (timer !== null) unschedule(timer);
      sendPending();
    },
    cancel() {
      if (timer !== null) unschedule(timer);
      timer = null;
      pending = null;
    },
  };
}
