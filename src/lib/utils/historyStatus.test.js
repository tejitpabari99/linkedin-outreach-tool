import { describe, it, expect } from 'vitest';
import { summarizeWeekStatus } from './historyStatus.js';

const config = { tasks: [{ id: 'a', min: 2 }, { id: 'b', min: 1 }] };
const baseWeek = { week: '2026-W01', start: '2026-01-01', end: '2026-01-07', counts: {}, metrics: {}, items: [], entries: [] };

describe('summarizeWeekStatus', () => {
  it('a fresh empty week is empty and untouched', () => {
    const r = summarizeWeekStatus(baseWeek, config);
    expect(r.status).toBe('empty');
    expect(r.touched).toBe(false);
  });

  it('one count below min is partial and touched', () => {
    const r = summarizeWeekStatus({ ...baseWeek, counts: { a: 1 } }, config);
    expect(r.status).toBe('partial');
    expect(r.touched).toBe(true);
  });

  it('every task at or above min is filled', () => {
    const r = summarizeWeekStatus({ ...baseWeek, counts: { a: 2, b: 1 } }, config);
    expect(r.status).toBe('filled');
  });

  it('zero counts but one entries[] row (any parseStatus) is partial and touched', () => {
    const r1 = summarizeWeekStatus({ ...baseWeek, entries: [{ id: 'e1', parseStatus: 'discarded' }] }, config);
    expect(r1.status).toBe('partial');
    expect(r1.touched).toBe(true);
    const r2 = summarizeWeekStatus({ ...baseWeek, entries: [{ id: 'e2', parseStatus: 'failed' }] }, config);
    expect(r2.status).toBe('partial');
    expect(r2.touched).toBe(true);
  });

  it('zero counts and no entries but one item is partial and touched', () => {
    const r = summarizeWeekStatus({ ...baseWeek, items: [{ id: 'i1' }] }, config);
    expect(r.status).toBe('partial');
    expect(r.touched).toBe(true);
  });

  it('config.tasks length 0 does not crash and is empty', () => {
    const r = summarizeWeekStatus(baseWeek, { tasks: [] });
    expect(r.status).toBe('empty');
    expect(r.total).toBe(0);
  });
});
