import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listWeekKeys: vi.fn(),
  loadConfig: vi.fn()
}));

vi.mock('$lib/weeks.js', () => ({ listWeekKeys: mocks.listWeekKeys }));
vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));

import { GET } from './+server.js';

const keys = [
  '2026-W30',
  '2026-W31',
  '2026-W32',
  '2026-W33',
  '2026-W34',
  '2026-W35'
];

function urlWith(query = '') {
  return new URL(`http://localhost/api/weeks${query}`);
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

describe('GET /api/weeks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWeekKeys.mockReturnValue(keys);
  });

  it('returns all earlier weeks newest-first with the default limit', async () => {
    const result = await responseBody(GET({ url: urlWith('?before=2026-W35') }));

    expect(result).toEqual({
      status: 200,
      body: { weeks: ['2026-W34', '2026-W33', '2026-W32', '2026-W31', '2026-W30'] }
    });
    expect(mocks.listWeekKeys).toHaveBeenCalledTimes(1);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
  });

  it('limits the page to the requested number of weeks', async () => {
    const result = await responseBody(GET({ url: urlWith('?before=2026-W35&limit=2') }));

    expect(result).toEqual({ status: 200, body: { weeks: ['2026-W34', '2026-W33'] } });
  });

  it('clamps an over-large limit to 26 without an error', async () => {
    const manyKeys = Array.from({ length: 30 }, (_, i) => `2026-W${String(i + 1).padStart(2, '0')}`);
    mocks.listWeekKeys.mockReturnValue(manyKeys);

    const result = await responseBody(GET({ url: urlWith('?before=2026-W35&limit=999') }));

    expect(result.status).toBe(200);
    expect(result.body.weeks).toHaveLength(26);
    expect(result.body.weeks[0]).toBe('2026-W30');
    expect(result.body.weeks.at(-1)).toBe('2026-W05');
  });

  it('uses the default limit for a non-numeric value', async () => {
    const manyKeys = Array.from({ length: 12 }, (_, i) => `2026-W${String(i + 20).padStart(2, '0')}`);
    mocks.listWeekKeys.mockReturnValue(manyKeys);

    const result = await responseBody(GET({
      url: urlWith('?before=2026-W35&limit=notanumber')
    }));

    expect(result.status).toBe(200);
    expect(result.body.weeks).toHaveLength(8);
    expect(result.body.weeks).toEqual([
      '2026-W31', '2026-W30', '2026-W29', '2026-W28',
      '2026-W27', '2026-W26', '2026-W25', '2026-W24'
    ]);
  });

  it.each(['', '?before=2026-w35', '?before=../x'])(
    'rejects missing or malformed before query: %s',
    async (query) => {
      const result = await responseBody(GET({ url: urlWith(query) }));

      expect(result.status).toBe(400);
      expect(mocks.listWeekKeys).not.toHaveBeenCalled();
      expect(mocks.loadConfig).not.toHaveBeenCalled();
    }
  );

  it('returns an empty page when no earlier week exists', async () => {
    const result = await responseBody(GET({ url: urlWith('?before=2020-W01') }));

    expect(result).toEqual({ status: 200, body: { weeks: [] } });
  });
});
