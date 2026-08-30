import { describe, expect, it } from 'vitest';
import { selectNextTask } from './selectNext.js';

const config = {
  lanes: [{ id: 'outreach' }, { id: 'presence' }],
  tasks: [
    { id: 'comments', lane: 'presence', min: 5, target: 10 },
    { id: 'invites', lane: 'outreach', min: 10, target: 15 },
    { id: 'post', lane: 'presence', min: 1, target: 1 },
    { id: 'dms', lane: 'outreach', min: 2, target: 4 },
    { id: 'call_ask', lane: 'outreach', min: 1, target: 2 }
  ]
};

describe('selectNextTask', () => {
  it('selects the first below-min outreach task in authored order', () => {
    expect(selectNextTask(config, {})).toBe('invites');
  });

  it('progresses through authored task order within the outreach lane', () => {
    expect(selectNextTask(config, { invites: 10 })).toBe('dms');
    expect(selectNextTask(config, { invites: 10, dms: 2 })).toBe('call_ask');
  });

  it('moves to the first presence task after every outreach minimum clears', () => {
    const counts = { invites: 10, dms: 2, call_ask: 1 };
    expect(selectNextTask(config, counts)).toBe('comments');
  });

  it('returns null once every minimum clears, even below stretch targets', () => {
    const counts = { invites: 10, dms: 2, call_ask: 1, comments: 5, post: 1 };
    expect(selectNextTask(config, counts)).toBeNull();
  });

  it('is deterministic and does not mutate its inputs', () => {
    const counts = { invites: 10, dms: 1 };
    const configBefore = structuredClone(config);
    const countsBefore = structuredClone(counts);

    expect(selectNextTask(config, counts)).toBe('dms');
    expect(selectNextTask(config, counts)).toBe('dms');
    expect(config).toEqual(configBefore);
    expect(counts).toEqual(countsBefore);
  });

  it('returns to a previously cleared task after a -1 correction', () => {
    const counts = { invites: 9, dms: 2, call_ask: 1, comments: 5, post: 1 };
    expect(selectNextTask(config, counts)).toBe('invites');
  });
});
