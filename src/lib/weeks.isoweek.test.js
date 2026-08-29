import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dateToWeekKey,
  weekKeyToRange,
  nextWeekKey,
  prevWeekKey,
  isValidWeekKey,
  listWeekKeys,
  WeekError
} from './weeks.js';

describe('dateToWeekKey — ISO week-year boundary fixtures (PRD §4.5)', () => {
  const cases = [
    ['2023-01-01', 'UTC', '2022-W52'],
    ['2027-01-01', 'UTC', '2026-W53'],
    ['2021-01-01', 'UTC', '2020-W53'],
    ['2026-12-31', 'UTC', '2026-W53'],
    ['2020-12-31', 'UTC', '2020-W53'],
    ['2026-01-01', 'UTC', '2026-W01'] // corrected edge case — PRD §9 Q1
  ];
  for (const [date, tz, expected] of cases) {
    it(`${date} (${tz}) resolves to ${expected}`, () => {
      expect(dateToWeekKey(new Date(`${date}T12:00:00Z`), tz)).toBe(expected);
    });
  }
});

describe('dateToWeekKey — DST safety', () => {
  it('does not shift the calendar day across the spring-forward transition (2026-03-08)', () => {
    const before = dateToWeekKey(new Date('2026-03-08T09:00:00Z'), 'America/Los_Angeles'); // 01:00 PST
    const after = dateToWeekKey(new Date('2026-03-08T20:00:00Z'), 'America/Los_Angeles');  // 13:00 PDT
    expect(before).toBe(after);
  });

  it('does not shift the calendar day across the fall-back transition (2026-11-01)', () => {
    const before = dateToWeekKey(new Date('2026-11-01T08:00:00Z'), 'America/Los_Angeles'); // 01:00 PDT
    const after = dateToWeekKey(new Date('2026-11-01T20:00:00Z'), 'America/Los_Angeles');  // 12:00 PST
    expect(before).toBe(after);
  });
});

describe('dateToWeekKey — timezone-safe "today" resolution', () => {
  it('an instant just after UTC midnight resolves against the previous local calendar day (documented PRD §4.5 example)', () => {
    // 2026-01-01T00:30:00Z is 2025-12-31T16:30:00 in America/Los_Angeles.
    expect(dateToWeekKey(new Date('2026-01-01T00:30:00Z'), 'America/Los_Angeles')).toBe('2026-W01');
  });

  it('an instant just after UTC midnight Monday resolves to the previous week when the local calendar date is still Sunday', () => {
    // 2026-01-05T00:30:00Z is Monday in UTC but 2026-01-04T16:30:00 (Sunday) in America/Los_Angeles.
    // A buggy implementation using the UTC calendar date directly would wrongly return 2026-W02 here.
    expect(dateToWeekKey(new Date('2026-01-05T00:30:00Z'), 'America/Los_Angeles')).toBe('2026-W01');
  });
});

describe('weekKeyToRange round-trips', () => {
  const keys = ['2026-W01', '2026-W35', '2026-W53', '2022-W52', '2020-W53'];
  for (const key of keys) {
    it(`${key}'s range start maps back to ${key}`, () => {
      const { start } = weekKeyToRange(key);
      expect(dateToWeekKey(new Date(`${start}T12:00:00Z`), 'UTC')).toBe(key);
    });
  }
});

describe('nextWeekKey / prevWeekKey', () => {
  it('crosses a normal year boundary', () => {
    expect(nextWeekKey('2025-W52')).toBe('2026-W01');
    expect(prevWeekKey('2026-W01')).toBe('2025-W52');
  });
  it('crosses a 53-week year boundary', () => {
    expect(nextWeekKey('2026-W53')).toBe('2027-W01');
    expect(prevWeekKey('2027-W01')).toBe('2026-W53');
  });
});

describe('isValidWeekKey', () => {
  const badKeys = ['2026-W54', '2026-w35', '2026-35', '', null, undefined, '2026-W00', 'not-a-key'];
  for (const bad of badKeys) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      expect(isValidWeekKey(bad)).toBe(false);
    });
  }
  it('accepts a well-formed key', () => {
    expect(isValidWeekKey('2026-W35')).toBe(true);
  });

  it('accepts week 53 for a confirmed 53-week ISO year (2026)', () => {
    expect(isValidWeekKey('2026-W53')).toBe(true);
  });

  it('accepts week 53 for a confirmed 53-week ISO year (2020)', () => {
    expect(isValidWeekKey('2020-W53')).toBe(true);
  });

  it('rejects week 53 for a confirmed 52-week ISO year (2023)', () => {
    expect(isValidWeekKey('2023-W53')).toBe(false);
  });

  it('rejects week 53 for a confirmed 52-week ISO year (2025)', () => {
    expect(isValidWeekKey('2025-W53')).toBe(false);
  });
});

describe('weekKeyToRange — year-aware week-number range check', () => {
  it('throws for a well-formed but non-existent week key (2023-W53, a 52-week year)', () => {
    expect(() => weekKeyToRange('2023-W53')).toThrow(WeekError);
  });

  it('still resolves a real 53rd week correctly (2026-W53)', () => {
    const { start, end } = weekKeyToRange('2026-W53');
    expect(start).toBe('2026-12-28');
    expect(end).toBe('2027-01-03');
  });
});

describe('listWeekKeys', () => {
  it('returns [] for a missing directory', () => {
    expect(listWeekKeys(join(tmpdir(), 'lot-weeks-does-not-exist-xyz'))).toEqual([]);
  });

  it('returns only valid week-key filenames, sorted chronologically across a year boundary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lot-weeks-'));
    for (const name of ['2026-W53.json', '2027-W01.json', '2026-W01.json', 'notes.txt', '.config.json.tmp-123']) {
      writeFileSync(join(dir, name), '{}', 'utf8');
    }
    expect(listWeekKeys(dir)).toEqual(['2026-W01', '2026-W53', '2027-W01']);
  });
});
