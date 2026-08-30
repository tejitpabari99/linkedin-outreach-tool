import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WeekError extends Error {}
  return {
    WeekError,
    loadConfig: vi.fn(),
    isValidWeekKey: vi.fn(() => true),
    readWeek: vi.fn(),
    writeWeek: vi.fn(),
    appendItem: vi.fn(),
    bumpCount: vi.fn(),
    attachItemLink: vi.fn()
  };
});

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  WeekError: mocks.WeekError,
  isValidWeekKey: mocks.isValidWeekKey,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek,
  appendItem: mocks.appendItem,
  bumpCount: mocks.bumpCount,
  attachItemLink: mocks.attachItemLink
}));

import { POST } from './+server.js';
import { PATCH } from './[id]/+server.js';

const cfg = {
  tasks: [
    { id: 'post', link: 'required' },
    { id: 'invites', link: 'optional' }
  ]
};
const baseWeek = {
  week: '2026-W35',
  counts: { post: 0, invites: 0 },
  metrics: {},
  items: [],
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
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockReturnValue(structuredClone(baseWeek));
    mocks.appendItem.mockImplementation((week, { taskId, link }) => {
      const item = { id: 'item-1', taskId, at: '2026-08-29T00:00:00.000Z', link };
      return { week: { ...week, items: [...week.items, item] }, item };
    });
    mocks.bumpCount.mockImplementation((week, taskId, delta) => ({
      ...week,
      counts: { ...week.counts, [taskId]: week.counts[taskId] + delta }
    }));
    mocks.attachItemLink.mockImplementation((week, id, link) => ({
      ...week,
      items: week.items.map(item => item.id === id ? { ...item, link } : item)
    }));
  });

  it('POST accepts link:null for a required-link task and increments its count', async () => {
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', link: null })
    }));

    expect(result.status).toBe(200);
    expect(result.body.item).toMatchObject({ taskId: 'post', link: null });
    expect(result.body.counts.post).toBe(1);
    expect(mocks.appendItem).toHaveBeenCalledWith(expect.any(Object), { taskId: 'post', link: null });
    expect(mocks.bumpCount).toHaveBeenCalledWith(expect.any(Object), 'post', 1);
  });

  it('POST accepts link:null for an optional-link task and increments its count', async () => {
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'invites', link: null })
    }));

    expect(result.status).toBe(200);
    expect(result.body.item).toMatchObject({ taskId: 'invites', link: null });
    expect(result.body.counts.invites).toBe(1);
    expect(mocks.appendItem).toHaveBeenCalledWith(expect.any(Object), { taskId: 'invites', link: null });
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });

  it('POST rejects a malformed link as a bad request without writing', async () => {
    mocks.appendItem.mockImplementation(() => {
      throw new mocks.WeekError('Item link must have non-empty url and label strings');
    });

    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'post', link: { url: 'x' } })
    }));

    expect(result).toEqual({
      status: 400,
      body: { error: 'Item link must have non-empty url and label strings' }
    });
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('POST rejects an unknown task without reading or writing a week', async () => {
    const result = await responseBody(await POST({
      params: { week: '2026-W35' },
      request: requestWith({ taskId: 'unknown', link: null })
    }));

    expect(result.status).toBe(400);
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', POST, { week: '2026-W35' }],
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
    expect(mocks.bumpCount).not.toHaveBeenCalled();
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

  it('POST rejects path traversal before reading the body or disk', async () => {
    const request = requestWith({ taskId: 'post', link: null });
    const result = await responseBody(await POST({ params: { week: '../../etc' }, request }));

    expect(result.status).toBe(400);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
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
