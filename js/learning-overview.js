export function learningOverview(raw, task = null) {
  const empty = { stage: 0, hasInitial: false, hasRevision: false, sources: 0 };
  let value;
  try { value = JSON.parse(raw); } catch { return empty; }
  if (task && (value?.taskId !== task.id || value?.taskVersion !== task.version)) return empty;
  if (!value || value.initialCommitted !== true || typeof value.initial !== 'string' || !value.initial.trim()) return empty;
  const hasRevision = typeof value.revision === 'string' && !!value.revision.trim() && Number(value.completedAt) > 0;
  return { stage: hasRevision ? 4 : [1, 2, 3].includes(value.stage) ? value.stage : 1,
    hasInitial: true, hasRevision, sources: Array.isArray(value.sourceIds) ? new Set(value.sourceIds.filter(x => ['lubiao', 'songpan'].includes(x))).size : 0 };
}
