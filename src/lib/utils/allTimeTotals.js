function normalizeArguments(weeksOrConfig, taskIdsOrWeeks) {
  if (Array.isArray(weeksOrConfig) || weeksOrConfig == null) {
    return {
      weeks: weeksOrConfig ?? [],
      taskIds: Array.isArray(taskIdsOrWeeks) ? taskIdsOrWeeks : []
    };
  }

  return {
    weeks: Array.isArray(taskIdsOrWeeks) ? taskIdsOrWeeks : [],
    taskIds: Array.isArray(weeksOrConfig.tasks)
      ? weeksOrConfig.tasks.map(task => task.id)
      : []
  };
}

export function sumAllTimeTotals(weeksOrConfig, taskIdsOrWeeks) {
  const { weeks, taskIds } = normalizeArguments(weeksOrConfig, taskIdsOrWeeks);
  const totals = Object.fromEntries(taskIds.map(taskId => [taskId, 0]));

  for (const week of weeks) {
    for (const taskId of Object.keys(totals)) {
      totals[taskId] += week?.counts?.[taskId] ?? 0;
    }
  }

  return totals;
}
