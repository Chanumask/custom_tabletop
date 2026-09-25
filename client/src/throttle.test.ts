import { describe, expect, it } from 'vitest';
import { throttle } from './throttle.js';

function harness() {
  let time = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const sent: number[] = [];
  const throttled = throttle<number>(
    (value) => sent.push(value),
    50,
    () => time,
    (fn, ms) => {
      const id = nextId++;
      timers.push({ at: time + ms, fn, id });
      return id;
    },
    (id) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
  );
  const advance = (ms: number) => {
    time += ms;
    for (const timer of [...timers].filter((candidate) => candidate.at <= time)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.fn();
    }
  };
  return { throttled, sent, advance };
}

describe('throttle', () => {
  it('sends the first value at once, then the latest once per interval', () => {
    const { throttled, sent, advance } = harness();
    throttled.call(1);
    throttled.call(2);
    throttled.call(3);
    expect(sent).toEqual([1]);
    advance(50);
    expect(sent).toEqual([1, 3]);
    advance(200);
    expect(sent).toEqual([1, 3]); // nothing new pending
  });

  it('flush sends the pending value right away (letting go of a drag)', () => {
    const { throttled, sent, advance } = harness();
    throttled.call(1);
    throttled.call(7);
    throttled.flush();
    expect(sent).toEqual([1, 7]);
    advance(100);
    expect(sent).toEqual([1, 7]); // not sent twice
  });

  it('cancel drops what is pending', () => {
    const { throttled, sent, advance } = harness();
    throttled.call(1);
    throttled.call(2);
    throttled.cancel();
    advance(100);
    expect(sent).toEqual([1]);
  });
});
