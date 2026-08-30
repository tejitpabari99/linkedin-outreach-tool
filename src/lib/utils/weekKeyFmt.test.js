import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, formatWeekRange } from './weekKeyFmt.js';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid calls and waits for the last call delay', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);

    for (let call = 1; call <= 5; call += 1) {
      debounced(call);
      if (call < 5) vi.advanceTimersByTime(100);
    }

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(5);
  });
});

describe('formatWeekRange', () => {
  const cases = [
    ['2026-W01', { start: '2025-12-29', end: '2026-01-04' }],
    ['2026-W35', { start: '2026-08-24', end: '2026-08-30' }],
    ['2026-W53', { start: '2026-12-28', end: '2027-01-03' }],
    ['2020-W53', { start: '2020-12-28', end: '2021-01-03' }],
    ['2022-W52', { start: '2022-12-26', end: '2023-01-01' }]
  ];

  it.each(cases)('formats %s as its Monday-Sunday range', (weekKey, expected) => {
    expect(formatWeekRange(weekKey)).toEqual(expected);
  });

  it.each(['2025-W53', '2026-W00', '2026-W99', '2026-35', null])(
    'rejects invalid week key %j',
    (weekKey) => {
      expect(() => formatWeekRange(weekKey)).toThrow();
    }
  );
});
