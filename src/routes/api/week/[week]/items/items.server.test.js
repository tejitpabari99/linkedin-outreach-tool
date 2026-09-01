import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WeekError extends Error {}
  return {
    WeekError,
    loadConfig: vi.fn(),
    isValidWeekKey: vi.fn(() => true),
    readWeek: vi.fn(),
    writeWeek: vi.fn(),
    appendItems: vi.fn(),
    removeItems: vi.fn(),
    attachItemLink: vi.fn()
  };
});

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  WeekError: mocks.WeekError,
  isValidWeekKey: mocks.isValidWeekKey,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  appendItems: mocks.appendItems,
  removeItems: mocks.removeItems,
  attachItemLink: mocks.attachItemLink
}));

import { DELETE, POST } from './+server.js';
import { PATCH } from './[id]/+server.js';

const cfg = {
  tasks: [
    { id: 'post', link: 'required' },
    { id: 'invites', link: 'optional' }
  ]
};
const baseWeek = {
  week: '2026-W35',
  counts: { post: 6, invites: 2 },
  metrics: {},
  items: [
    { id: 'post-1', taskId: 'post', at: '2026-08-28T00:00:00.000Z', note: 'one', link: null },
    { id: 'invite-1', taskId: 'invites', at: '2026-08-29T00:00:00.000Z', note: 'two', link: null },
    { id: 'post-2', taskId: 'post', at: '2026-08-30T00:00:00.000Z', note: 'three', link: null }
  ],
  entries: []
};

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

describe('week item routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isValidWeekKey.mockReturnValue(true);
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockReturnValue(structuredClone(baseWeek));
    mocks.appendItems.mockImplementation((week, { taskId, notes }) => {
      const items = notes.map((note, index) => ({
        id: `new-${index + 1}`,
        taskId,
        at: '2026-08-31T00:00:00.000Z',
        note,
        link: null
      }));
      return {
        items,
        week: {
          ...week,
          counts: { ...week.counts, [taskId]: week.counts[taskId] + notes.length },
          items: [...week.items, ...items]
        }
      };
    });
    mocks.removeItems.mockImplementation((week, { taskId, itemIds }) => ({
      removedIds: [...itemIds],
      week: {
        ...week,
        counts: { ...week.counts, [taskId]: week.counts[taskId] - itemIds.length },
        items: week.items.filter(item => !itemIds.includes(item.id))
      }
    }));
    mocks.attachItemLink.mockImplementation((week, id, link) => ({
      ...week,
      items: week.items.map(item => item.id === id ? { ...item, link } : item)
    }));
  });

  it('POST creates an ordered batch, increments by N, writes once, and returns the projected week', async () => {
    const notes = ['first', 'second', 'third'];
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', notes })
    }));

    expect(result.status).toBe(200);
    expect(result.body.items.map(item => item.note)).toEqual(notes);
    expect(result.body.week.counts.post).toBe(9);
    expect(result.body.week.items.slice(-3)).toEqual(result.body.items);
    expect(mocks.appendItems).toHaveBeenCalledWith(expect.any(Object), { taskId: 'post', notes });
    expect(mocks.readWeek).toHaveBeenCalledTimes(1);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', result.body.week);
  });

  it.each([1, 50])('POST accepts the %i-note boundary', async (size) => {
    const notes = Array.from({ length: size }, (_, index) => `note-${index}`);
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', notes })
    }));

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(size);
    expect(result.body.week.counts.post).toBe(6 + size);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });

  it.each([0, 51])('POST rejects a %i-note batch before reading or writing', async (size) => {
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', notes: Array(size).fill('note') })
    }));

    expect(result.status).toBe(400);
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('POST is all-or-nothing when one note is invalid', async () => {
    mocks.appendItems.mockImplementation(() => {
      throw new mocks.WeekError('notes[1] must contain 1 to 4000 characters after trimming');
    });
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', notes: ['valid', '   ', 'also valid'] })
    }));

    expect(result).toEqual({
      status: 400,
      body: { error: 'notes[1] must contain 1 to 4000 characters after trimming' }
    });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('POST rejects an unknown task before reading or writing', async () => {
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'unknown', notes: ['note'] })
    }));

    expect(result.status).toBe(400);
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('POST preserves URL-like values as plain note strings without promoting links', async () => {
    const notes = [
      'plain text', 'https://example.com', 'http://example.com', 'not a url://value',
      'javascript:alert(1)', 'data:text/html,hello', '//example.com/path',
      'https:\\example.com', 'https://example.com/\u0001control'
    ];
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', notes })
    }));

    expect(result.status).toBe(200);
    expect(result.body.items.map(item => item.note)).toEqual(notes);
    expect(result.body.items.every(item => item.link === null)).toBe(true);
  });

  it('POST maps a corrupt week to the established server error without writing', async () => {
    mocks.readWeek.mockImplementation(() => { throw new mocks.WeekError('corrupt'); });
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', notes: ['note'] })
    }));

    expect(result).toEqual({
      status: 500,
      body: { error: 'Week file 2026-W35 exists but could not be parsed', week: '2026-W35' }
    });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('DELETE removes selected rows, preserves residual count, writes once, and returns the projection', async () => {
    const result = await responseBody(await DELETE({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', itemIds: ['post-1', 'post-2'] })
    }));

    expect(result.status).toBe(200);
    expect(result.body.removedIds).toEqual(['post-1', 'post-2']);
    expect(result.body.week.counts).toEqual({ post: 4, invites: 2 });
    expect(result.body.week.items).toEqual([baseWeek.items[1]]);
    expect(result.body.week.counts.post - result.body.week.items.filter(item => item.taskId === 'post').length).toBe(4);
    expect(mocks.removeItems).toHaveBeenCalledWith(expect.any(Object), {
      taskId: 'post', itemIds: ['post-1', 'post-2']
    });
    expect(mocks.readWeek).toHaveBeenCalledTimes(1);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', result.body.week);
  });

  it.each([
    ['duplicate', 'itemIds must be unique'],
    ['missing', 'Item "missing" not found in week 2026-W35'],
    ['stale', 'Item "stale" not found in week 2026-W35'],
    ['cross-task', 'Item "invite-1" does not belong to task "post"'],
    ['count', 'Count for "post" is less than the number of selected items']
  ])('DELETE maps %s validation failures to 400 with zero writes', async (_case, message) => {
    mocks.removeItems.mockImplementation(() => { throw new mocks.WeekError(message); });
    const result = await responseBody(await DELETE({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', itemIds: ['post-1', 'post-2'] })
    }));

    expect(result).toEqual({ status: 400, body: { error: message } });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('DELETE rejects an unknown task before reading or writing', async () => {
    const result = await responseBody(await DELETE({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'unknown', itemIds: ['post-1'] })
    }));

    expect(result.status).toBe(400);
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', POST, { week: '2026-W35' }],
    ['DELETE', DELETE, { week: '2026-W35' }],
    ['PATCH', PATCH, { week: '2026-W35', id: 'item-1' }]
  ])('%s rejects a non-object body before config or disk access', async (_method, handler, params) => {
    const result = await responseBody(await handler({ params, request: requestWith(null) }));

    expect(result).toEqual({
      status: 400,
      body: { error: 'Request body must be a JSON object' }
    });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('PATCH attaches a link while leaving counts unchanged', async () => {
    const link = { url: 'https://x', label: 'updated' };
    const week = {
      ...structuredClone(baseWeek),
      counts: { post: 4, invites: 2 },
      items: [{ id: 'item-1', taskId: 'post', link: null }]
    };
    mocks.readWeek.mockReturnValue(week);

    const result = await responseBody(await PATCH({
      params: { week: '2026-W35', id: 'item-1' },
      request: requestWith({ link })
    }));

    expect(result).toEqual({
      status: 200,
      body: { item: { id: 'item-1', taskId: 'post', link } }
    });
    expect(mocks.writeWeek.mock.calls[0][1].counts).toEqual({ post: 4, invites: 2 });
  });

  it('PATCH returns 404 for an unknown item id without writing', async () => {
    mocks.attachItemLink.mockImplementation(() => {
      throw new mocks.WeekError('Item "missing" not found');
    });

    const result = await responseBody(await PATCH({
      params: { week: '2026-W35', id: 'missing' },
      request: requestWith({ link: { url: 'https://x', label: 'x' } })
    }));

    expect(result.status).toBe(404);
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', POST, { taskId: 'post', notes: ['note'] }],
    ['DELETE', DELETE, { taskId: 'post', itemIds: ['post-1'] }]
  ])('%s rejects path traversal before body, config, or disk access', async (_method, handler, body) => {
    const request = requestWith(body);
    const result = await responseBody(await handler({ params: { week: '../../etc' }, request }));

    expect(result.status).toBe(400);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
  });

  it('POST rejects an impossible ISO week before body access', async () => {
    mocks.isValidWeekKey.mockReturnValue(false);
    const request = requestWith({ taskId: 'post', notes: ['note'] });
    const result = await responseBody(await POST({ params: { week: '2026-W53' }, request }));

    expect(result.status).toBe(400);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.loadConfig).not.toHaveBeenCalled();
  });

  it('PATCH rejects path traversal before reading the body or disk', async () => {
    const request = requestWith({ link: null });
    const result = await responseBody(await PATCH({
      params: { week: '../../etc', id: 'item-1' },
      request
    }));

    expect(result.status).toBe(400);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
  });
});
