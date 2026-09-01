import { describe, expect, it } from 'vitest';
import { sumAllTimeTotals } from './allTimeTotals.js';

const taskIds = ['post', 'comments', 'invites', 'dms', 'call_ask'];

describe('sumAllTimeTotals', () => {
  it('returns every task at zero for no weeks', () => {
    expect(sumAllTimeTotals([], taskIds)).toEqual({
      post: 0,
      comments: 0,
      invites: 0,
      dms: 0,
      call_ask: 0
    });
  });

  it.each([
    ['manual-item', { counts: { post: 1 }, items: [{ taskId: 'post' }], entries: [] }],
    ['diary-applied', { counts: { comments: 3 }, items: [], entries: [{ applied: { counts: { comments: 3 } } }] }],
    ['mixed', { counts: { post: 2, comments: 4 }, items: [{ taskId: 'post' }], entries: [{ applied: { counts: { comments: 4 } } }] }]
  ])('counts a %s week exactly once from counts', (_kind, week) => {
    expect(sumAllTimeTotals([week], taskIds)).toEqual({
      post: week.counts.post ?? 0,
      comments: week.counts.comments ?? 0,
      invites: 0,
      dms: 0,
      call_ask: 0
    });
  });

  it('ignores orphan task ids while retaining all requested keys', () => {
    expect(sumAllTimeTotals([{ counts: { post: 2, orphan: 99 } }], taskIds)).toEqual({
      post: 2,
      comments: 0,
      invites: 0,
      dms: 0,
      call_ask: 0
    });
  });

  it('includes every week when there are more than 52', () => {
    const weeks = Array.from({ length: 60 }, () => ({ counts: { invites: 1 } }));
    expect(sumAllTimeTotals(weeks, taskIds).invites).toBe(60);
  });

  it('treats missing weeks and missing counts as zero', () => {
    expect(sumAllTimeTotals(undefined, taskIds)).toEqual(Object.fromEntries(taskIds.map(id => [id, 0])));
    expect(sumAllTimeTotals([null, {}, { counts: {} }], taskIds)).toEqual(Object.fromEntries(taskIds.map(id => [id, 0])));
  });
});
