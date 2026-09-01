import { describe, expect, it } from 'vitest';
import {
  activityDay,
  activityRange,
  activityRangeAggregate,
  buildActivityIndex
} from './activityTally.js';

const config = {
  timezone: 'America/Los_Angeles',
  tasks: [
    { id: 'post' },
    { id: 'comments' },
    { id: 'invites' },
    { id: 'dms' },
    { id: 'call_ask' }
  ]
};

describe('buildActivityIndex', () => {
  it('counts only ok diary entries with applied counts on their explicit local date', () => {
    const entries = [
      { id: 'ok', date: '2026-08-25', parseStatus: 'ok', text: 'raw', applied: { counts: { comments: 3 } }, metrics: { replies: 9 } },
      { id: 'pending', date: '2026-08-25', parseStatus: 'pending', applied: { counts: { comments: 20 } } },
      { id: 'failed', date: '2026-08-25', parseStatus: 'failed', applied: { counts: { comments: 20 } } },
      { id: 'discarded', date: '2026-08-25', parseStatus: 'discarded', applied: { counts: { comments: 20 } } },
      { id: 'proposed', date: '2026-08-25', parseStatus: 'ok', proposed: { counts: { comments: 20 } } }
    ];
    const index = buildActivityIndex([{ counts: { comments: 100 }, metrics: { replies: 100 }, entries }], config);

    expect(activityDay(index, '2026-08-25').counts).toEqual({ comments: 3 });
  });

  it('counts every manual item once without adding aggregate week counts', () => {
    const index = buildActivityIndex([{
      counts: { post: 99, dms: 99 },
      items: [
        { id: 'p1', taskId: 'post', at: '2026-08-25T19:00:00Z', note: 'A post' },
        { id: 'd1', taskId: 'dms', at: '2026-08-25T20:00:00Z', note: 'A DM' }
      ]
    }], config);

    expect(activityDay(index, '2026-08-25').counts).toEqual({ post: 1, dms: 1 });
  });

  it('combines diary and manual contributions on one day without double-counting', () => {
    const index = buildActivityIndex([{
      counts: { post: 9 },
      entries: [{ date: '2026-08-25', parseStatus: 'ok', applied: { counts: { post: 2 } } }],
      items: [{ id: 'p1', taskId: 'post', at: '2026-08-25T19:00:00Z', note: 'Manual post' }]
    }], config);

    expect(activityDay(index, '2026-08-25').counts.post).toBe(3);
  });

  it('counts the same item id only once when it appears in two week objects', () => {
    const duplicate = {
      id: 'shared-item',
      taskId: 'invites',
      at: '2026-08-25T19:00:00Z',
      note: 'Shared projection'
    };
    const index = buildActivityIndex([
      { week: '2026-W35', items: [duplicate] },
      { week: '2026-W36', items: [{ ...duplicate }] }
    ], config);

    expect(activityDay(index, '2026-08-25').counts.invites).toBe(1);
  });

  it('uses the configured local calendar date near a UTC/Pacific midnight boundary', () => {
    const index = buildActivityIndex([{
      items: [{ id: 'i1', taskId: 'invites', at: '2026-08-31T06:30:00Z', note: 'Late Sunday' }]
    }], config);

    expect(activityDay(index, '2026-08-30').counts.invites).toBe(1);
    expect(activityDay(index, '2026-08-31').counts.invites).toBeUndefined();
  });

  it('keeps notes for non-post tasks with their task and raw text', () => {
    const index = buildActivityIndex([{
      items: [
        { id: 'comment', taskId: 'comments', at: '2026-08-25T19:00:00Z', note: 'Thoughtful reply' },
        { id: 'unsafe', taskId: 'invites', at: '2026-08-25T20:00:00Z', note: 'javascript:alert(1)' }
      ]
    }], config);

    expect(activityDay(index, '2026-08-25').noteItems).toEqual([
      { id: 'comment', taskId: 'comments', note: 'Thoughtful reply', link: null },
      { id: 'unsafe', taskId: 'invites', note: 'javascript:alert(1)', link: null }
    ]);
  });

  it('counts a bare manual item without adding a note line', () => {
    const index = buildActivityIndex([{
      items: [{ id: 'bare', taskId: 'dms', at: '2026-08-25T19:00:00Z' }]
    }], config);

    expect(activityDay(index, '2026-08-25')).toEqual({
      date: '2026-08-25',
      counts: { dms: 1 },
      noteItems: []
    });
  });

  it('keeps legacy post links with their local day', () => {
    const index = buildActivityIndex([{
      items: [{
        id: 'legacy',
        taskId: 'post',
        at: '2026-08-25T22:00:00Z',
        link: { label: 'LinkedIn', url: 'https://linkedin.com/feed/' }
      }]
    }], config);

    expect(activityDay(index, '2026-08-25').noteItems).toEqual([{
      id: 'legacy',
      taskId: 'post',
      note: null,
      link: { label: 'LinkedIn', url: 'https://linkedin.com/feed/' }
    }]);
  });
});

describe('activityDay and activityRange', () => {
  const index = buildActivityIndex([
    { entries: [{ date: '2026-08-30', parseStatus: 'ok', applied: { counts: { comments: 2 } } }] },
    { items: [{ id: 'd1', taskId: 'dms', at: '2026-09-01T19:00:00Z', note: 'Follow-up' }] }
  ], config);

  it('returns a zero tally for a single day with no activity', () => {
    expect(activityDay(index, '2026-08-31')).toEqual({ date: '2026-08-31', counts: {}, noteItems: [] });
    expect(activityRange(index, '2026-08-31', '2026-08-31')).toEqual([
      { date: '2026-08-31', counts: {}, noteItems: [] }
    ]);
  });

  it('normalizes a reversed cross-week/month range and emits every day ascending', () => {
    const rows = activityRange(index, '2026-09-02', '2026-08-30');
    expect(rows.map(row => row.date)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02'
    ]);
    expect(rows.map(row => row.counts)).toEqual([
      { comments: 2 },
      {},
      { dms: 1 },
      {}
    ]);
  });

  it('sums each task across the full range', () => {
    const aggregate = activityRangeAggregate(index, '2026-08-30', '2026-09-02');

    expect(aggregate.counts).toEqual({ comments: 2, dms: 1 });
    expect(aggregate.noteItems).toEqual([
      {
        id: 'd1',
        taskId: 'dms',
        note: 'Follow-up',
        link: null,
        date: '2026-09-01'
      }
    ]);
  });
});
