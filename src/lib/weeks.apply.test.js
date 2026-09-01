import { describe, it, expect } from 'vitest';
import {
  emptyWeek, bumpCount, setMetric, appendEntry, applyEntryToWeek,
  discardEntry, markEntryFailed, removeEntry, appendItem, attachItemLink,
  appendItems, removeItems, setItemNote, WeekError, MAX_APPLY_DELTA
} from './weeks.js';

const CONFIG = {
  tasks: [{ id: 'invites' }, { id: 'comments' }, { id: 'post' }],
  metrics: [{ id: 'followers' }]
};

function baseWeek() {
  return emptyWeek('2026-W35', CONFIG);
}

describe('bumpCount', () => {
  it('clamps at 0 instead of going negative', () => {
    let week = baseWeek();
    week = bumpCount(week, 'invites', 2);
    week = bumpCount(week, 'invites', -5);
    expect(week.counts.invites).toBe(0);
  });
  it('does not mutate the input week', () => {
    const week = baseWeek();
    const frozen = structuredClone(week);
    bumpCount(week, 'invites', 3);
    expect(week).toEqual(frozen);
  });
  it('rejects a non-integer delta', () => {
    expect(() => bumpCount(baseWeek(), 'invites', 1.5)).toThrow(WeekError);
  });
});

describe('setMetric', () => {
  it('accepts null to clear a metric', () => {
    const week = setMetric(baseWeek(), 'followers', null);
    expect(week.metrics.followers).toBeNull();
  });
  it('rejects a negative value', () => {
    expect(() => setMetric(baseWeek(), 'followers', -1)).toThrow(WeekError);
  });
  it('rejects NaN', () => {
    expect(() => setMetric(baseWeek(), 'followers', NaN)).toThrow(WeekError);
  });
  it('does not mutate the input week', () => {
    const week = baseWeek();
    const frozen = structuredClone(week);
    setMetric(week, 'followers', 500);
    expect(week).toEqual(frozen);
  });
});

describe('appendEntry -> applyEntryToWeek happy path', () => {
  it('adds counts, sets metrics, and marks the entry ok', () => {
    let week = baseWeek();
    const { week: withEntry, entry } = appendEntry(week, { date: '2026-09-02', text: 'left 4 comments, sent 6 invites' });
    week = applyEntryToWeek(withEntry, entry.id, {
      counts: { comments: 4, invites: 6 },
      metrics: { followers: 1032 }
    });
    expect(week.counts.comments).toBe(4);
    expect(week.counts.invites).toBe(6);
    expect(week.metrics.followers).toBe(1032);
    const stored = week.entries.find(e => e.id === entry.id);
    expect(stored.parseStatus).toBe('ok');
    expect(stored.applied).toEqual({ counts: { comments: 4, invites: 6 }, metrics: { followers: 1032 } });
  });

  it('overwrites (does not add to) an existing metric value on a second entry', () => {
    let week = setMetric(baseWeek(), 'followers', 1000);
    const { week: withEntry, entry } = appendEntry(week, { date: '2026-09-03', text: 'followers at 1010' });
    week = applyEntryToWeek(withEntry, entry.id, { counts: {}, metrics: { followers: 1010 } });
    expect(week.metrics.followers).toBe(1010); // overwritten, not 1000+1010
  });
});

describe('idempotency guard — non-pending entries never transition again', () => {
  it('applyEntryToWeek throws when called twice on the same entry', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    const applied = applyEntryToWeek(week, entry.id, { counts: {}, metrics: {} });
    expect(() => applyEntryToWeek(applied, entry.id, { counts: {}, metrics: {} })).toThrow(WeekError);
  });

  it('discardEntry throws when the entry was already applied', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    const applied = applyEntryToWeek(week, entry.id, { counts: {}, metrics: {} });
    expect(() => discardEntry(applied, entry.id)).toThrow(WeekError);
  });

  it('markEntryFailed throws when the entry was already discarded', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    const discarded = discardEntry(week, entry.id);
    expect(() => markEntryFailed(discarded, entry.id)).toThrow(WeekError);
  });
});

describe('applyEntryToWeek delta validation', () => {
  it('rejects a negative count delta', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    expect(() => applyEntryToWeek(week, entry.id, { counts: { invites: -1 }, metrics: {} })).toThrow(WeekError);
  });
  it('rejects a non-integer count delta', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    expect(() => applyEntryToWeek(week, entry.id, { counts: { invites: 1.5 }, metrics: {} })).toThrow(WeekError);
  });
  it('rejects a delta exceeding MAX_APPLY_DELTA', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    expect(() => applyEntryToWeek(week, entry.id, { counts: { invites: MAX_APPLY_DELTA + 1 }, metrics: {} })).toThrow(WeekError);
  });
});

describe('removeEntry', () => {
  it('removes the log row but leaves counts/metrics unchanged for an already-applied entry (no undo)', () => {
    const { week: withEntry, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    let week = applyEntryToWeek(withEntry, entry.id, { counts: { invites: 5 }, metrics: {} });
    const before = week.counts.invites;
    week = removeEntry(week, entry.id);
    expect(week.entries.find(e => e.id === entry.id)).toBeUndefined();
    expect(week.counts.invites).toBe(before);
  });
});

describe('appendItem / attachItemLink', () => {
  it('accepts a valid link', () => {
    const { week, item } = appendItem(baseWeek(), { taskId: 'post', link: { url: 'https://x', label: 'anchor post' } });
    expect(week.items.find(i => i.id === item.id).link.url).toBe('https://x');
  });
  it('accepts a null link', () => {
    const { item } = appendItem(baseWeek(), { taskId: 'post', link: null });
    expect(item.link).toBeNull();
  });
  it('throws on a malformed link (missing label)', () => {
    expect(() => appendItem(baseWeek(), { taskId: 'post', link: { url: 'https://x' } })).toThrow(WeekError);
  });
  it.each(['javascript:alert(1)', '/\\evil.com'])('throws on unsafe item link url %j', (url) => {
    expect(() => appendItem(baseWeek(), { taskId: 'post', link: { url, label: 'unsafe' } })).toThrow(WeekError);
  });
  it("attachItemLink updates an existing item's link", () => {
    const { week, item } = appendItem(baseWeek(), { taskId: 'post', link: null });
    const updated = attachItemLink(week, item.id, { url: 'https://y', label: 'later link' });
    expect(updated.items.find(i => i.id === item.id).link.url).toBe('https://y');
  });
});

describe('appendItems', () => {
  it('appends distinct ordered trimmed rows, increments by N, and does not mutate input', () => {
    const input = baseWeek();
    input.counts.comments = 4;
    input.metrics.followers = 1200;
    input.entries.push({ id: 'entry-1', parseStatus: 'ok' });
    const before = structuredClone(input);

    const { week, items } = appendItems(input, {
      taskId: 'comments',
      notes: [' first note ', 'https://example.com/post', '\tthird note\n']
    });

    expect(items.map(item => item.note)).toEqual(['first note', 'https://example.com/post', 'third note']);
    expect(new Set(items.map(item => item.id)).size).toBe(3);
    expect(items.every(item => item.taskId === 'comments' && item.link === null)).toBe(true);
    expect(items.every(item => !Number.isNaN(Date.parse(item.at)))).toBe(true);
    expect(week.items).toEqual(items);
    expect(week.counts.comments).toBe(7);
    expect(week.metrics).toEqual(input.metrics);
    expect(week.entries).toEqual(input.entries);
    expect(input).toEqual(before);
  });

  it.each([null, undefined, '', '   '])('appends a bare item for empty note value %j', (note) => {
    const input = baseWeek();
    const before = structuredClone(input);

    const { week, items } = appendItems(input, { taskId: 'comments', notes: [note] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ taskId: 'comments', note: null, link: null });
    expect(week.items).toEqual(items);
    expect(week.counts.comments).toBe(1);
    expect(input).toEqual(before);
  });

  it('appends noted and bare items in one batch and increments for both', () => {
    const { week, items } = appendItems(baseWeek(), {
      taskId: 'comments', notes: [' hi ', null]
    });

    expect(items.map(item => item.note)).toEqual(['hi', null]);
    expect(week.counts.comments).toBe(2);
  });

  it.each([
    ['an empty batch', []],
    ['more than 50 notes', Array.from({ length: 51 }, (_, index) => `note ${index}`)],
    ['a non-string non-null note', ['valid', 42]],
    ['a note over 4000 characters', ['valid', 'x'.repeat(4001)]]
  ])('rejects %s without a partial result or input mutation', (_label, notes) => {
    const input = baseWeek();
    const before = structuredClone(input);
    expect(() => appendItems(input, { taskId: 'comments', notes })).toThrow(WeekError);
    expect(input).toEqual(before);
  });
});

describe('setItemNote', () => {
  function weekWithItem() {
    const week = baseWeek();
    week.items.push({
      id: 'comment-1', taskId: 'comments', at: '2026-09-01T01:00:00.000Z', note: null, link: null
    });
    return week;
  }

  it('sets a trimmed note without mutating the input', () => {
    const input = weekWithItem();
    const before = structuredClone(input);
    const updated = setItemNote(input, 'comment-1', '  hello  ');

    expect(updated.items[0].note).toBe('hello');
    expect(updated).not.toBe(input);
    expect(input).toEqual(before);
  });

  it('clears a note with null', () => {
    const input = weekWithItem();
    input.items[0].note = 'hello';

    expect(setItemNote(input, 'comment-1', null).items[0].note).toBeNull();
  });

  it.each([
    ['unknown item id', 'missing', 'hello'],
    ['a note over 4000 characters', 'comment-1', 'x'.repeat(4001)]
  ])('rejects %s', (_case, itemId, note) => {
    expect(() => setItemNote(weekWithItem(), itemId, note)).toThrow(WeekError);
  });
});

describe('removeItems', () => {
  function itemizedWeek({ count = 3 } = {}) {
    const week = baseWeek();
    week.counts.comments = count;
    week.metrics.followers = 99;
    week.entries.push({ id: 'entry-1', parseStatus: 'ok' });
    week.items.push(
      { id: 'comment-1', taskId: 'comments', at: '2026-09-01T01:00:00.000Z', note: 'one', link: null },
      { id: 'comment-2', taskId: 'comments', at: '2026-09-01T02:00:00.000Z', note: 'two', link: null },
      { id: 'post-1', taskId: 'post', at: '2026-09-01T03:00:00.000Z', note: 'post', link: null }
    );
    return week;
  }

  it.each([
    ['an empty id list', []],
    ['duplicate ids', ['comment-1', 'comment-1']],
    ['a missing id', ['missing-id']],
    ['a cross-task id', ['post-1']]
  ])('rejects %s without mutating input', (_label, itemIds) => {
    const input = itemizedWeek();
    const before = structuredClone(input);
    expect(() => removeItems(input, { taskId: 'comments', itemIds })).toThrow(WeekError);
    expect(input).toEqual(before);
  });

  it('rejects a stale id from an already-removed row without mutating the newer week', () => {
    const original = itemizedWeek();
    const { week: newer } = removeItems(original, { taskId: 'comments', itemIds: ['comment-1'] });
    const before = structuredClone(newer);
    expect(() => removeItems(newer, { taskId: 'comments', itemIds: ['comment-1'] })).toThrow(WeekError);
    expect(newer).toEqual(before);
  });

  it('rejects when count is less than the selected item count instead of clamping', () => {
    const input = itemizedWeek({ count: 1 });
    const before = structuredClone(input);
    expect(() => removeItems(input, {
      taskId: 'comments', itemIds: ['comment-1', 'comment-2']
    })).toThrow(WeekError);
    expect(input).toEqual(before);
  });

  it('removes exact rows while preserving an unitemized residual and unrelated fields', () => {
    const input = itemizedWeek({ count: 7 });
    const before = structuredClone(input);

    const { week, removedIds } = removeItems(input, {
      taskId: 'comments', itemIds: ['comment-2', 'comment-1']
    });

    expect(removedIds).toEqual(['comment-2', 'comment-1']);
    expect(week.counts.comments).toBe(5);
    expect(week.items).toEqual([before.items[2]]);
    expect(week.counts.post).toBe(before.counts.post);
    expect(week.metrics).toEqual(before.metrics);
    expect(week.entries).toEqual(before.entries);
    expect({ ...week, counts: undefined, items: undefined }).toEqual({ ...before, counts: undefined, items: undefined });
    expect(input).toEqual(before);
  });

  it('allows count equal to selected item count and reaches zero', () => {
    const input = itemizedWeek({ count: 2 });
    const { week } = removeItems(input, {
      taskId: 'comments', itemIds: ['comment-1', 'comment-2']
    });
    expect(week.counts.comments).toBe(0);
    expect(week.items.map(item => item.id)).toEqual(['post-1']);
  });
});

describe('structuredClone isolation across mutation functions', () => {
  it('appendEntry does not mutate the input week', () => {
    const week = baseWeek();
    const frozen = structuredClone(week);
    appendEntry(week, { date: '2026-09-02', text: 'x' });
    expect(week).toEqual(frozen);
  });

  it('applyEntryToWeek does not mutate the input week object', () => {
    const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
    const frozen = structuredClone(week);
    applyEntryToWeek(week, entry.id, { counts: { invites: 3 }, metrics: {} });
    expect(week).toEqual(frozen);
  });
});
