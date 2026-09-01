import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WeekError extends Error {}
  return {
    WeekError,
    loadConfig: vi.fn(),
    readWeek: vi.fn(),
    listWeekKeys: vi.fn(),
    isValidWeekKey: vi.fn(),
    emptyWeek: vi.fn(),
    validateConfig: vi.fn(),
    writeConfig: vi.fn(),
    isAllowedUrl: vi.fn(),
    writeWeek: vi.fn(),
    existsSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn()
  };
});

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  copyFileSync: mocks.copyFileSync,
  mkdirSync: mocks.mkdirSync
}));
vi.mock('$lib/config.js', () => ({
  CONFIG_PATH: 'Q:\\scratch\\config\\config.json',
  loadConfig: mocks.loadConfig,
  validateConfig: mocks.validateConfig,
  writeConfig: mocks.writeConfig,
  isAllowedUrl: mocks.isAllowedUrl
}));
vi.mock('$lib/weeks.js', () => ({
  DATA_DIR: 'Q:\\scratch\\data',
  WeekError: mocks.WeekError,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  listWeekKeys: mocks.listWeekKeys,
  isValidWeekKey: mocks.isValidWeekKey,
  emptyWeek: mocks.emptyWeek
}));

import { POST as importData } from '../import/+server.js';
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

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

describe('export routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockImplementation(key => key === '2026-W34' ? week34 : week35);
    mocks.listWeekKeys.mockReturnValue(['2026-W34', '2026-W35']);
    mocks.isValidWeekKey.mockReturnValue(true);
    mocks.validateConfig.mockImplementation(value => value);
    mocks.existsSync.mockReturnValue(false);
    mocks.isAllowedUrl.mockImplementation(url => {
      try {
        return ['http:', 'https:'].includes(new URL(url).protocol);
      } catch {
        return false;
      }
    });
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

  it('omits corrupt weeks and reports them without losing healthy weeks', async () => {
    mocks.readWeek.mockImplementation(key => {
      if (key === '2026-W35') throw new mocks.WeekError('corrupt week file');
      return week34;
    });

    const response = exportAll();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      config: cfg,
      weeks: { '2026-W34': week34 },
      unreadableWeeks: ['2026-W35']
    });
    expect(mocks.emptyWeek).not.toHaveBeenCalled();
  });

  it('preserves noted, null-note, and absent-note items across export-import-export', async () => {
    const richWeek = {
      ...week35,
      items: [
        {
          id: 'safe-note', taskId: 'post', at: '2026-08-29T20:00:00.000Z',
          note: 'https://www.linkedin.com/posts/example', link: null
        },
        {
          id: 'unsafe-note', taskId: 'post', at: '2026-08-29T20:01:00.000Z',
          note: 'javascript:alert(1)', link: null
        },
        {
          id: 'plain-note', taskId: 'post', at: '2026-08-29T20:02:00.000Z',
          note: '  comment on Priya’s post  ', link: null
        },
        {
          id: 'bare-null', taskId: 'post', at: '2026-08-29T20:03:00.000Z',
          note: null, link: null
        },
        {
          id: 'legacy-link', taskId: 'post', at: '2026-08-29T20:04:00.000Z',
          link: { url: 'https://example.test/legacy', label: 'Legacy post' }
        }
      ]
    };
    mocks.listWeekKeys.mockReturnValue(['2026-W35']);
    mocks.readWeek.mockReturnValue(richWeek);

    const firstBundle = await exportAll().json();
    const importResponse = await importData({ request: requestWith(firstBundle) });

    expect(importResponse.status).toBe(200);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', richWeek);
    const importedWeek = structuredClone(mocks.writeWeek.mock.calls[0][1]);
    mocks.readWeek.mockReturnValue(importedWeek);
    const secondBundle = await exportAll().json();

    expect(secondBundle.weeks['2026-W35'].items).toEqual(firstBundle.weeks['2026-W35'].items);
    expect(secondBundle.weeks['2026-W35'].items.map(item => item.note)).toEqual([
      'https://www.linkedin.com/posts/example',
      'javascript:alert(1)',
      '  comment on Priya’s post  ',
      null,
      undefined
    ]);
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
