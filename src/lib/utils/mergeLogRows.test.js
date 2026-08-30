import { describe, it, expect } from 'vitest';
import { mergeLogRows } from './mergeLogRows.js';

describe('mergeLogRows', () => {
  it('merges two disjoint weeks into one sorted-descending list with no duplicates', () => {
    const w1 = { week: '2026-W34', entries: [{ id: 'e1', at: '2026-08-20T09:00:00Z' }], items: [] };
    const w2 = { week: '2026-W35', entries: [], items: [{ id: 'i1', taskId: 'post', at: '2026-08-25T10:00:00Z' }] };
    const rows = mergeLogRows([], [w1, w2]);
    expect(rows.map(r => r.id)).toEqual(['item:i1', 'entry:e1']);
  });

  it('re-merging the same week (dirty-week reconciliation) replaces rows by id, no duplication', () => {
    const w1v1 = { week: '2026-W35', entries: [{ id: 'e1', at: '2026-08-24T09:00:00Z' }], items: [] };
    const rows1 = mergeLogRows([], [w1v1]);
    const w1v2 = { week: '2026-W35', entries: [{ id: 'e1', at: '2026-08-24T09:00:00Z', parseStatus: 'ok' }], items: [] };
    const rows2 = mergeLogRows(rows1, [w1v2]);
    expect(rows2.length).toBe(1);
    expect(rows2[0].entry.parseStatus).toBe('ok');
  });

  it('entries and items from the same week interleave by at timestamp, not grouped by kind', () => {
    const w1 = {
      week: '2026-W35',
      entries: [{ id: 'e1', at: '2026-08-24T08:00:00Z' }, { id: 'e2', at: '2026-08-24T12:00:00Z' }],
      items: [{ id: 'i1', taskId: 'post', at: '2026-08-24T10:00:00Z' }]
    };
    const rows = mergeLogRows([], [w1]);
    expect(rows.map(r => r.id)).toEqual(['entry:e2', 'item:i1', 'entry:e1']);
  });
});
