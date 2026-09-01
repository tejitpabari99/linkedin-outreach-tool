import { describe, expect, it } from 'vitest';
import { PRODUCT_TASK_IDS, taskVisual } from './taskVisuals.js';

describe('taskVisual', () => {
  it.each([
    ['post', { symbol: '✦', short: 'Posts', colorRole: 'secondary' }],
    ['comments', { symbol: '◆', short: 'Comments', colorRole: 'accent' }],
    ['invites', { symbol: '➜', short: 'Requests', colorRole: 'info' }],
    ['dms', { symbol: '◇', short: 'DMs', colorRole: 'primary' }],
    ['call_ask', { symbol: '◎', short: 'Calls', colorRole: 'call' }]
  ])('returns the canonical visual for %s', (taskId, expected) => {
    expect(taskVisual(taskId)).toEqual(expected);
  });

  it('falls back safely for an unknown id and uses an available config label', () => {
    expect(taskVisual('future_task')).toEqual({
      symbol: '•',
      short: 'future_task',
      colorRole: 'neutral'
    });
    expect(taskVisual('future_task', { label: 'Future task' })).toEqual({
      symbol: '•',
      short: 'Future task',
      colorRole: 'neutral'
    });
  });

  it('exports the five product task ids in display order', () => {
    expect(PRODUCT_TASK_IDS).toEqual(['post', 'comments', 'invites', 'dms', 'call_ask']);
  });
});
