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
  post: Object.freeze({ text: 'text-[var(--lot-task-post)]', background: 'bg-[var(--lot-task-post)]' }),
  comments: Object.freeze({ text: 'text-[var(--lot-task-comments)]', background: 'bg-[var(--lot-task-comments)]' }),
  invites: Object.freeze({ text: 'text-[var(--lot-task-invites)]', background: 'bg-[var(--lot-task-invites)]' }),
  dms: Object.freeze({ text: 'text-[var(--lot-task-dms)]', background: 'bg-[var(--lot-task-dms)]' }),
  call_ask: Object.freeze({ text: 'text-[var(--lot-task-call)]', background: 'bg-[var(--lot-task-call)]' })
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
