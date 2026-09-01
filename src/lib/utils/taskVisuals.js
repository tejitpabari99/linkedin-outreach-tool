export const PRODUCT_TASK_IDS = Object.freeze([
  'post',
  'comments',
  'invites',
  'dms',
  'call_ask'
]);

export const TASK_VISUALS = Object.freeze({
  post: Object.freeze({ symbol: '✦', short: 'Posts', colorRole: 'secondary' }),
  comments: Object.freeze({ symbol: '◆', short: 'Comments', colorRole: 'accent' }),
  invites: Object.freeze({ symbol: '➜', short: 'Requests', colorRole: 'info' }),
  dms: Object.freeze({ symbol: '◇', short: 'DMs', colorRole: 'primary' }),
  call_ask: Object.freeze({ symbol: '◎', short: 'Calls', colorRole: 'call' })
});

function configLabel(taskId, configOrLabel) {
  if (typeof configOrLabel === 'string' && configOrLabel) return configOrLabel;
  if (configOrLabel?.label) return configOrLabel.label;
  return configOrLabel?.tasks?.find(task => task.id === taskId)?.label;
}

export function taskVisual(taskId, configOrLabel) {
  return TASK_VISUALS[taskId] ?? {
    symbol: '•',
    short: configLabel(taskId, configOrLabel) ?? taskId,
    colorRole: 'neutral'
  };
}
