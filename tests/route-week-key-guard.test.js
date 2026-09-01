import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WeekError extends Error {}
  return {
    WeekError,
    isValidWeekKey: vi.fn(),
    readWeek: vi.fn(),
    writeWeek: vi.fn(),
    bumpCount: vi.fn(),
    setMetric: vi.fn(),
    applyEntryToWeek: vi.fn(),
    discardEntry: vi.fn(),
    removeEntry: vi.fn(),
    appendItem: vi.fn(),
    appendItems: vi.fn(),
    attachItemLink: vi.fn()
  };
});

const config = {
  tasks: [{ id: 'post', link: 'required' }],
  metrics: [{ id: 'followers' }]
};

vi.mock('$lib/config.js', () => ({ loadConfig: vi.fn(() => config) }));
vi.mock('$lib/parse.js', () => ({ parseDiaryEntry: vi.fn() }));
vi.mock('$lib/weeks.js', () => ({
  WeekError: mocks.WeekError,
  ...mocks
}));

import { GET as getWeek, PATCH as patchWeek } from '../src/routes/api/week/[week]/+server.js';
import { DELETE as deleteEntry } from '../src/routes/api/week/[week]/entry/[id]/+server.js';
import { POST as applyEntry } from '../src/routes/api/week/[week]/entry/[id]/apply/+server.js';
import { POST as discardEntry } from '../src/routes/api/week/[week]/entry/[id]/discard/+server.js';
import { POST as reparseEntry } from '../src/routes/api/week/[week]/entry/[id]/reparse/+server.js';
import { POST as createItem } from '../src/routes/api/week/[week]/items/+server.js';
import { PATCH as patchItem } from '../src/routes/api/week/[week]/items/[id]/+server.js';
import { GET as exportWeek } from '../src/routes/api/export/+server.js';

const INVALID_KEYS = ['../../etc/passwd', '2026-W1', '2026-w35', '2026-W35/x', ''];
const VALID_KEY = '2026-W35';
const SEMANTICALLY_INVALID_KEY = '2026-W99';

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

function emptyWeek(key) {
  return {
    version: 1,
    week: key,
    start: '2026-08-24',
    end: '2026-08-30',
    counts: { post: 0 },
    metrics: { followers: null },
    items: [],
    entries: []
  };
}

const routes = [
  {
    name: 'GET /api/week/[week]',
    invoke: week => getWeek({ params: { week } })
  },
  {
    name: 'PATCH /api/week/[week]',
    invoke: week => patchWeek({
      params: { week },
      request: requestWith({ counts: {}, metrics: {} })
    })
  },
  {
    name: 'DELETE /api/week/[week]/entry/[id]',
    invoke: week => deleteEntry({ params: { week, id: 'missing' } })
  },
  {
    name: 'POST /api/week/[week]/entry/[id]/apply',
    invoke: week => applyEntry({ params: { week, id: 'missing' } })
  },
  {
    name: 'POST /api/week/[week]/entry/[id]/discard',
    invoke: week => discardEntry({ params: { week, id: 'missing' } })
  },
  {
    name: 'POST /api/week/[week]/entry/[id]/reparse',
    invoke: week => reparseEntry({ params: { week, id: 'missing' } })
  },
  {
    name: 'POST /api/week/[week]/items',
    invoke: week => createItem({
      params: { week },
      request: requestWith({ taskId: 'post', notes: ['note'] })
    })
  },
  {
    name: 'PATCH /api/week/[week]/items/[id]',
    invoke: week => patchItem({
      params: { week, id: 'missing' },
      request: requestWith({ link: null })
    })
  },
  {
    name: 'GET /api/export?week=',
    invoke: week => exportWeek({
      url: new URL(`http://localhost/api/export?week=${encodeURIComponent(week)}`)
    })
  }
];

const weekSpies = Object.values(mocks).filter(value => typeof value === 'function' && 'mock' in value);

async function captureInvocation(route, week) {
  try {
    return { response: await route.invoke(week), error: null };
  } catch (error) {
    return { response: null, error };
  }
}

describe.each(routes)('$name week-key guard', route => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isValidWeekKey.mockImplementation(key => key !== SEMANTICALLY_INVALID_KEY);
    mocks.readWeek.mockImplementation(key => {
      if (key === SEMANTICALLY_INVALID_KEY) {
        throw new mocks.WeekError(`Invalid week key "${key}"`);
      }
      return emptyWeek(key);
    });
    mocks.bumpCount.mockImplementation(week => week);
    mocks.setMetric.mockImplementation(week => week);
    mocks.appendItem.mockImplementation(week => ({
      week,
      item: { id: 'item-1', taskId: 'post', link: null }
    }));
    mocks.appendItems.mockImplementation(week => ({
      week,
      items: [{ id: 'item-1', taskId: 'post', note: 'note', link: null }]
    }));
    mocks.removeEntry.mockImplementation(() => {
      throw new mocks.WeekError('Entry not found');
    });
    mocks.attachItemLink.mockImplementation(() => {
      throw new mocks.WeekError('Item not found');
    });
  });

  it.each(INVALID_KEYS)('rejects syntactically invalid key %j before any weeks call', async week => {
    const { response, error } = await captureInvocation(route, week);

    expect(error).toBeNull();
    expect(response.status).toBe(400);
    for (const spy of weekSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('rejects 2026-W99 through semantic validation before reading a week', async () => {
    const { response, error } = await captureInvocation(route, SEMANTICALLY_INVALID_KEY);

    expect(mocks.isValidWeekKey).toHaveBeenCalledWith(SEMANTICALLY_INVALID_KEY);
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(error).toBeNull();
    expect(response.status).toBe(400);
  });

  it('returns a generic 500 for a corrupt valid-key week without leaking the file path', async () => {
    mocks.readWeek.mockImplementation(() => {
      throw new mocks.WeekError('Could not parse Q:\\private\\data\\2026-W35.json');
    });

    const { response, error } = await captureInvocation(route, VALID_KEY);

    expect(error).toBeNull();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: `Week file ${VALID_KEY} exists but could not be parsed`,
      week: VALID_KEY
    });
  });

  it('does not reject a valid week key at the route guard', async () => {
    const { response, error } = await captureInvocation(route, VALID_KEY);

    expect(error).toBeNull();
    expect(response.status).not.toBe(400);
    expect(mocks.readWeek).toHaveBeenCalledWith(VALID_KEY, config);
  });
});
