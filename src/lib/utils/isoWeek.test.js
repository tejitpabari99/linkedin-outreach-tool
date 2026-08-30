import { describe, it, expect } from 'vitest';
import { dateToWeekKey, weekKeyToRange } from './isoWeek.js';
import * as sp1Weeks from '../weeks.js'; // Node-only test environment, fine under vitest per PRD §7

const TZ = 'UTC';

describe('isoWeek.js — SP1 fixture parity', () => {
  const fixtures = [
    ['2023-01-01', '2022-W52'],
    ['2027-01-01', '2026-W53'],
    ['2021-01-01', '2020-W53'],
    ['2026-12-31', '2026-W53'],
    ['2020-12-31', '2020-W53'],
    ['2026-01-01', '2026-W01']
  ];
  it.each(fixtures)('%s -> %s', (dateStr, expected) => {
    expect(dateToWeekKey(dateStr, TZ)).toBe(expected);
  });

  it('every fixture matches SP1\'s own dateToWeekKey byte-for-byte', () => {
    for (const [dateStr, expected] of fixtures) {
      const sp1Result = sp1Weeks.dateToWeekKey(new Date(`${dateStr}T12:00:00Z`), TZ);
      expect(dateToWeekKey(dateStr, TZ)).toBe(sp1Result);
      expect(sp1Result).toBe(expected);
    }
  });
});

describe('weekKeyToRange round-trip', () => {
  it.each(['2026-W01', '2026-W35', '2026-W53', '2020-W53'])('%s round-trips to a Monday-Sunday range', (key) => {
    const { start, end } = weekKeyToRange(key);
    expect(dateToWeekKey(start, TZ)).toBe(key);
    expect(dateToWeekKey(end, TZ)).toBe(key);
  });

  it('rejects malformed week keys', () => {
    expect(() => weekKeyToRange('nope')).toThrow();
  });
});

describe('retro-logging ISO-boundary correctness (PRD §4.10)', () => {
  it('a Sunday and the Monday immediately after it land in different, correctly-ordered weeks', () => {
    // 2026-08-17 is a Monday (verified: Jan 1 2026 is a Thursday per SP1 §9 Q1;
    // day-229-of-year arithmetic places Aug 17 on a Monday).
    expect(dateToWeekKey('2026-08-23', TZ)).toBe('2026-W34'); // Sunday, last day of that week
    expect(dateToWeekKey('2026-08-24', TZ)).toBe('2026-W35'); // Monday, first day of the next week
  });

  it('uses the configured production timezone for string inputs at a week boundary', () => {
    expect(dateToWeekKey('2026-08-23', 'America/Los_Angeles')).toBe('2026-W34');
    expect(dateToWeekKey('2026-08-24', 'America/Los_Angeles')).toBe('2026-W35');
  });

  it('a same-week date picked at either end of the week resolves identically', () => {
    expect(dateToWeekKey('2026-08-17', TZ)).toBe(dateToWeekKey('2026-08-23', TZ));
  });
});
