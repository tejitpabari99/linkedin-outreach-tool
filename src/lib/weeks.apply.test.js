import { describe, it, expect } from 'vitest';
import {
  emptyWeek, bumpCount, setMetric, appendEntry, applyEntryToWeek,
  discardEntry, markEntryFailed, removeEntry, appendItem, attachItemLink,
  WeekError, MAX_APPLY_DELTA
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
