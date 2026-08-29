import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readWeek: vi.fn(),
  writeWeek: vi.fn(),
  discardEntry: vi.fn()
}));

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  discardEntry: mocks.discardEntry
}));

import { POST } from './+server.js';

const cfg = { tasks: [], metrics: [] };
const params = { week: '2026-W35', id: 'entry-1' };

function pendingWeek() {
  return {
    week: '2026-W35',
    entries: [{
      id: 'entry-1',
      parseStatus: 'pending',
      proposed: { counts: { invites: 6 }, metrics: {} },
      applied: null
    }]
  };
}

function discard(week, id) {
  const next = structuredClone(week);
  next.entries.find((entry) => entry.id === id).parseStatus = 'discarded';
  return next;
}

describe('POST discard entry', () => {
  let storedWeek;

  beforeEach(() => {
    vi.clearAllMocks();
    storedWeek = pendingWeek();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockImplementation(() => storedWeek);
    mocks.discardEntry.mockImplementation(discard);
    mocks.writeWeek.mockImplementation((_weekKey, week) => {
      storedWeek = week;
    });
  });

  it('discards a pending proposal without setting applied', async () => {
    const response = POST({ params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alreadyDiscarded).toBe(false);
    expect(body.entry).toMatchObject({
      id: 'entry-1',
      parseStatus: 'discarded',
      applied: null
    });
    expect(mocks.discardEntry).toHaveBeenCalledWith(expect.any(Object), 'entry-1');
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', storedWeek);
  });

  it('makes a repeated discard an idempotent no-op', async () => {
    const firstResponse = POST({ params });
    expect(firstResponse.status).toBe(200);
    const afterFirst = structuredClone(storedWeek);

    const secondResponse = POST({ params });
    const body = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(body.alreadyDiscarded).toBe(true);
    expect(storedWeek).toEqual(afterFirst);
    expect(mocks.discardEntry).toHaveBeenCalledTimes(1);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });

  it('returns 409 for a pending entry without a proposal', async () => {
    storedWeek.entries[0].proposed = null;

    const response = POST({ params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Entry has no pending parse to discard' });
    expect(mocks.discardEntry).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each(['ok', 'failed'])(
    'returns 409 for an entry in %s state',
    async (parseStatus) => {
      storedWeek.entries[0].parseStatus = parseStatus;

      const response = POST({ params });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'Entry has no pending parse to discard' });
      expect(mocks.discardEntry).not.toHaveBeenCalled();
      expect(mocks.writeWeek).not.toHaveBeenCalled();
    }
  );

  it('returns 404 for an unknown entry id', async () => {
    const response = POST({ params: { ...params, id: 'missing' } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Entry not found' });
    expect(mocks.discardEntry).not.toHaveBeenCalled();
  });

  it('rejects path traversal before config or disk access', async () => {
    const response = POST({ params: { week: '../../etc', id: 'entry-1' } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid week key' });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });
});
