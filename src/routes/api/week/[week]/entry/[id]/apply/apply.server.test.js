import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readWeek: vi.fn(),
  writeWeek: vi.fn(),
  applyEntryToWeek: vi.fn()
}));

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  applyEntryToWeek: mocks.applyEntryToWeek
}));

import { POST } from './+server.js';

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

describe('apply double-click idempotency', () => {
  let storedWeek;

  beforeEach(() => {
    vi.clearAllMocks();
    storedWeek = pendingWeek();
    mocks.loadConfig.mockReturnValue({ tasks: [], metrics: [] });
    mocks.readWeek.mockImplementation(() => storedWeek);
    mocks.applyEntryToWeek.mockImplementation((week, id, approved) => {
      const next = structuredClone(week);
      next.counts.invites += approved.counts.invites;
      next.metrics.followers = approved.metrics.followers;
      const entry = next.entries.find(candidate => candidate.id === id);
      entry.parseStatus = 'ok';
      entry.applied = approved;
      return next;
    });
    mocks.writeWeek.mockImplementation((_key, week) => {
      storedWeek = week;
    });
  });

  it('applies exactly once across two sequential POSTs', async () => {
    const firstResponse = await POST({ params });
    const firstBody = await firstResponse.json();
    const afterFirst = structuredClone(storedWeek);

    const secondResponse = await POST({ params });
    const secondBody = await secondResponse.json();
    const afterSecond = structuredClone(storedWeek);

    expect(firstResponse.status).toBe(200);
    expect(firstBody.alreadyApplied).toBe(false);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.alreadyApplied).toBe(true);
    expect(mocks.applyEntryToWeek).toHaveBeenCalledTimes(1);
    expect(afterSecond.counts).toEqual(afterFirst.counts);
    expect(afterSecond.metrics).toEqual(afterFirst.metrics);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });
});
