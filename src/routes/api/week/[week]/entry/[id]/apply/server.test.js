import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  isValidWeekKey: vi.fn(() => true),
  readWeek: vi.fn(),
  writeWeek: vi.fn(),
  applyEntryToWeek: vi.fn()
}));

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  isValidWeekKey: mocks.isValidWeekKey,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  applyEntryToWeek: mocks.applyEntryToWeek
}));

import { POST } from './+server.js';

const cfg = { tasks: [], metrics: [] };
const params = { week: '2026-W35', id: 'entry-1' };

function pendingWeek() {
  return {
    week: '2026-W35',
    counts: { invites: 2 },
    metrics: { followers: 100 },
    entries: [{
      id: 'entry-1',
      parseStatus: 'pending',
      proposed: { counts: { invites: 6 }, metrics: { followers: 125 } },
      applied: null
    }]
  };
}

function apply(week, id, approved) {
  const next = structuredClone(week);
  next.counts.invites += approved.counts.invites;
  next.metrics.followers = approved.metrics.followers;
  const entry = next.entries.find((candidate) => candidate.id === id);
  entry.parseStatus = 'ok';
  entry.applied = approved;
  return next;
}

describe('POST apply entry', () => {
  let storedWeek;

  beforeEach(() => {
    vi.clearAllMocks();
    storedWeek = pendingWeek();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockImplementation(() => storedWeek);
    mocks.applyEntryToWeek.mockImplementation(apply);
    mocks.writeWeek.mockImplementation((_weekKey, week) => {
      storedWeek = week;
    });
  });

  it('applies a pending proposal exactly once and persists the updated week', async () => {
    const response = POST({ params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alreadyApplied).toBe(false);
    expect(body.entry).toMatchObject({
      id: 'entry-1',
      parseStatus: 'ok',
      applied: { counts: { invites: 6 }, metrics: { followers: 125 } }
    });
    expect(storedWeek.counts).toEqual({ invites: 8 });
    expect(storedWeek.metrics).toEqual({ followers: 125 });
    expect(mocks.applyEntryToWeek).toHaveBeenCalledWith(
      expect.any(Object),
      'entry-1',
      { counts: { invites: 6 }, metrics: { followers: 125 } }
    );
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });

  it('makes a second apply an idempotent no-op', async () => {
    const firstResponse = POST({ params });
    expect(firstResponse.status).toBe(200);
    const afterFirst = structuredClone(storedWeek);

    const secondResponse = POST({ params });
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondBody.alreadyApplied).toBe(true);
    expect(storedWeek.counts).toEqual(afterFirst.counts);
    expect(storedWeek.metrics).toEqual(afterFirst.metrics);
    expect(mocks.applyEntryToWeek).toHaveBeenCalledTimes(1);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });

  it('returns 409 for a pending entry without a proposal', async () => {
    storedWeek.entries[0].proposed = null;

    const response = POST({ params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Entry has no pending parse to apply' });
    expect(mocks.applyEntryToWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each(['failed', 'discarded'])(
    'returns 409 for an entry in %s state',
    async (parseStatus) => {
      storedWeek.entries[0].parseStatus = parseStatus;

      const response = POST({ params });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'Entry has no pending parse to apply' });
      expect(mocks.applyEntryToWeek).not.toHaveBeenCalled();
      expect(mocks.writeWeek).not.toHaveBeenCalled();
    }
  );

  it('returns 404 for an unknown entry id', async () => {
    const response = POST({ params: { ...params, id: 'missing' } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Entry not found' });
    expect(mocks.applyEntryToWeek).not.toHaveBeenCalled();
  });

  it.each(['../../etc', '2026-W1', '2026-w35'])(
    'rejects invalid week %s before config or disk access',
    async (week) => {
      const response = POST({ params: { week, id: 'entry-1' } });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid week key' });
      expect(mocks.loadConfig).not.toHaveBeenCalled();
      expect(mocks.readWeek).not.toHaveBeenCalled();
    }
  );
});
