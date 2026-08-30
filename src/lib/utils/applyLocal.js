export function bumpLocalCount(counts, taskId, delta) {
  if (!Number.isInteger(delta)) return counts;
  counts[taskId] = Math.max(0, (counts[taskId] ?? 0) + delta);
  return counts;
}

export function setLocalMetric(metrics, metricId, value) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return metrics;
  metrics[metricId] = value;
  return metrics;
}
