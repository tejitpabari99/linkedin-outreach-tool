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

const TASK_COLOR_CLASSES = Object.freeze({
  post: Object.freeze({ text: 'text-secondary', background: 'bg-secondary' }),
  comments: Object.freeze({ text: 'text-accent', background: 'bg-accent' }),
  invites: Object.freeze({ text: 'text-info', background: 'bg-info' }),
  dms: Object.freeze({ text: 'text-primary', background: 'bg-primary' }),
  call_ask: Object.freeze({ text: 'text-warning', background: 'bg-warning' })
});

const DEFAULT_COLOR_CLASSES = Object.freeze({
  text: 'text-base-content',
  background: 'bg-neutral'
});

export function taskColorClass(taskId, usage = 'text') {
  const classes = TASK_COLOR_CLASSES[taskId] ?? DEFAULT_COLOR_CLASSES;
  return classes[usage] ?? classes.text;
}

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
