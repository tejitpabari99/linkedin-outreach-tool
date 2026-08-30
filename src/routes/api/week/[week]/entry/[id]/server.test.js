import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WeekError extends Error {}
  return {
    WeekError,
    loadConfig: vi.fn(),
    isValidWeekKey: vi.fn(() => true),
    readWeek: vi.fn(),
    writeWeek: vi.fn(),
    removeEntry: vi.fn()
  };
});

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  WeekError: mocks.WeekError,
  isValidWeekKey: mocks.isValidWeekKey,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  removeEntry: mocks.removeEntry
}));

import { DELETE } from './+server.js';

const cfg = { tasks: [], metrics: [] };
const params = { week: '2026-W35', id: 'entry-1' };

function remove(week, id) {
  const next = structuredClone(week);
  const index = next.entries.findIndex((entry) => entry.id === id);
  if (index === -1) throw new mocks.WeekError(`Entry "${id}" not found`);
  next.entries.splice(index, 1);
  return next;
}

describe('DELETE entry', () => {
  let week;

  beforeEach(() => {
    vi.clearAllMocks();
    week = {
      week: '2026-W35',
      counts: { invites: 6 },
      metrics: { followers: 120 },
      entries: [{ id: 'entry-1', parseStatus: 'pending', applied: null }]
    };
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockImplementation(() => week);
    mocks.removeEntry.mockImplementation(remove);
  });

  it('removes a pending entry and persists the resulting week', async () => {
    const response = DELETE({ params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.removeEntry).toHaveBeenCalledWith(week, 'entry-1');
    const persistedWeek = mocks.writeWeek.mock.calls[0][1];
    expect(persistedWeek.entries).toEqual([]);
  });

  it('removes an applied entry without reversing its counts or metrics', async () => {
    week.entries[0] = {
      id: 'entry-1',
      parseStatus: 'ok',
      applied: { counts: { invites: 6 }, metrics: { followers: 120 } }
    };
    const beforeCounts = structuredClone(week.counts);
    const beforeMetrics = structuredClone(week.metrics);

    const response = DELETE({ params });

    expect(response.status).toBe(200);
    const persistedWeek = mocks.writeWeek.mock.calls[0][1];
    expect(persistedWeek.entries).toEqual([]);
    expect(persistedWeek.counts).toEqual(beforeCounts);
    expect(persistedWeek.metrics).toEqual(beforeMetrics);
  });

  it('returns 404 when removeEntry reports an unknown id', async () => {
    const response = DELETE({ params: { ...params, id: 'missing' } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Entry "missing" not found' });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('rejects path traversal before config or disk access', async () => {
    const response = DELETE({ params: { week: '../../etc', id: 'entry-1' } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid week key' });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.removeEntry).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });
});
