import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WeekError extends Error {}
  return {
    WeekError,
    loadConfig: vi.fn(),
    readWeek: vi.fn(),
    writeWeek: vi.fn(),
    bumpCount: vi.fn(),
    setMetric: vi.fn()
  };
});

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  WeekError: mocks.WeekError,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  bumpCount: mocks.bumpCount,
  setMetric: mocks.setMetric
}));

import { GET, PATCH } from './+server.js';

const cfg = {
  tasks: [{ id: 'invites' }],
  metrics: [{ id: 'followers' }]
};
const emptyWeek = {
  version: 1,
  week: '2026-W35',
  start: '2026-08-24',
  end: '2026-08-30',
  counts: { invites: 0 },
  metrics: { followers: null },
  items: [],
  entries: []
};

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

describe('GET/PATCH /api/week/[week]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockReturnValue(structuredClone(emptyWeek));
    mocks.bumpCount.mockImplementation((week, taskId, delta) => ({
      ...week,
      counts: { ...week.counts, [taskId]: Math.max(0, (week.counts[taskId] ?? 0) + delta) }
    }));
    mocks.setMetric.mockImplementation((week, metricId, value) => ({
      ...week,
      metrics: { ...week.metrics, [metricId]: value }
    }));
  });

  it('GET returns an empty template for a missing week without writing', async () => {
    const result = await responseBody(GET({ params: { week: '2026-W35' } }));

    expect(result).toEqual({ status: 200, body: emptyWeek });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('GET returns 500 when an existing week file is corrupt', async () => {
    mocks.readWeek.mockImplementation(() => {
      throw new mocks.WeekError('invalid JSON');
    });

    const result = await responseBody(GET({ params: { week: '2026-W35' } }));

    expect(result).toEqual({
      status: 500,
      body: {
        error: 'Week file 2026-W35 exists but could not be parsed',
        week: '2026-W35'
      }
    });
  });

  it('PATCH applies count deltas and writes once', async () => {
    const result = await responseBody(await PATCH({
      params: { week: '2026-W35' },
      request: requestWith({ counts: { invites: 1 } })
    }));

    expect(result.status).toBe(200);
    expect(result.body.counts.invites).toBe(1);
    expect(mocks.bumpCount).toHaveBeenCalledWith(expect.any(Object), 'invites', 1);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });

  it('PATCH decrements counts with bumpCount floor behavior', async () => {
    const result = await responseBody(await PATCH({
      params: { week: '2026-W35' },
      request: requestWith({ counts: { invites: -1 } })
    }));

    expect(result.body.counts.invites).toBe(0);
    expect(mocks.bumpCount).toHaveBeenCalledWith(expect.any(Object), 'invites', -1);
  });

  it('PATCH overwrites metrics absolutely with setMetric', async () => {
    const result = await responseBody(await PATCH({
      params: { week: '2026-W35' },
      request: requestWith({ metrics: { followers: 1035 } })
    }));

    expect(result.body.metrics.followers).toBe(1035);
    expect(mocks.setMetric).toHaveBeenCalledWith(expect.any(Object), 'followers', 1035);
  });

  it.each([
    { counts: { unknown_task: 1 } },
    { metrics: { unknown_metric: 1 } }
  ])('PATCH rejects unknown ids before reading or writing: %j', async (body) => {
    const result = await responseBody(await PATCH({
      params: { week: '2026-W35' },
      request: requestWith(body)
    }));

    expect(result.status).toBe(400);
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each(['../../etc', 'bad-key'])('GET rejects invalid week %s before disk access', async (week) => {
    const result = await responseBody(GET({ params: { week } }));

    expect(result.status).toBe(400);
    expect(mocks.readWeek).not.toHaveBeenCalled();
  });

  it.each(['../../etc', 'bad-key'])('PATCH rejects invalid week %s before body or disk access', async (week) => {
    const request = requestWith({ counts: { invites: 1 } });
    const result = await responseBody(await PATCH({ params: { week }, request }));

    expect(result.status).toBe(400);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('PATCH rejects a non-object body before config or disk access', async () => {
    const result = await responseBody(await PATCH({
      params: { week: '2026-W35' },
      request: requestWith(null)
    }));

    expect(result).toEqual({
      status: 400,
      body: { error: 'Request body must be a JSON object' }
    });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('PATCH converts WeekError validation failures to 400 without writing', async () => {
    mocks.bumpCount.mockImplementation(() => {
      throw new mocks.WeekError('bad delta');
    });

    const result = await responseBody(await PATCH({
      params: { week: '2026-W35' },
      request: requestWith({ counts: { invites: 1 } })
    }));

    expect(result).toEqual({ status: 400, body: { error: 'bad delta' } });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });
});
