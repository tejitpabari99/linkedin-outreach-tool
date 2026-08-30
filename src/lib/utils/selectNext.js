export function selectNextTask(config, counts) {
  const orderedTasks = config.lanes.flatMap((lane) =>
    config.tasks.filter((task) => task.lane === lane.id)
  );

  for (const task of orderedTasks) {
    if ((counts[task.id] ?? 0) < task.min) return task.id;
  }

  return null;
}
