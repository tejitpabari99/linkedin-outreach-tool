import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readWeek: vi.fn(),
  listWeekKeys: vi.fn()
}));

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  readWeek: mocks.readWeek,
  listWeekKeys: mocks.listWeekKeys
}));

import { GET as exportWeek } from './+server.js';
import { GET as exportAll } from './all/+server.js';

const cfg = { version: 1, name: 'Outreach', tasks: [], metrics: [] };
const week35 = {
  version: 1,
  week: '2026-W35',
  start: '2026-08-24',
  end: '2026-08-30',
  counts: {},
  metrics: {},
  items: [],
  entries: []
};
const week34 = { ...week35, week: '2026-W34', start: '2026-08-17', end: '2026-08-23' };

function urlWith(query = '') {
  return new URL(`http://localhost/api/export${query}`);
}

describe('export routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockImplementation(key => key === '2026-W34' ? week34 : week35);
    mocks.listWeekKeys.mockReturnValue(['2026-W34', '2026-W35']);
  });

  it('exports an empty template for a never-logged week with an attachment filename', async () => {
    const response = exportWeek({ url: urlWith('?week=2026-W35') });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="2026-W35.json"');
    expect(await response.json()).toEqual(week35);
    expect(mocks.readWeek).toHaveBeenCalledWith('2026-W35', cfg);
  });

  it('rejects an invalid or missing week query before config or disk access', async () => {
    for (const query of ['', '?week=bad-key']) {
      const response = exportWeek({ url: urlWith(query) });
      expect(response.status).toBe(400);
    }

    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
  });

  it('exports live config and every existing week in a dated attachment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T21:00:00.000Z'));
    try {
      const response = exportAll();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="linkedin-outreach-export-2026-08-29.json"'
      );
      expect(await response.json()).toEqual({
        config: cfg,
        weeks: { '2026-W34': week34, '2026-W35': week35 }
      });
      expect(mocks.listWeekKeys).toHaveBeenCalledTimes(1);
      expect(mocks.readWeek.mock.calls).toEqual([
        ['2026-W34', cfg],
        ['2026-W35', cfg]
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
