const SESSION_KINDS = new Set([
  "host_start", "host_join", "learner_join", "host_update", "host_advance", "host_end",
  "record_letter", "record_word", "select_story", "passage_ready", "passage_timer", "finish_passage",
  "record_passage_miscue", "remove_passage_miscue", "record_miscue", "remove_miscue",
  "record_comprehension", "save_experience_rating", "finalize", "save_final_assessment_review", "assessment_commit",
]);
const codeOf = body => String(body?.offline_code || body?.code || "").trim().toUpperCase();
const learnerOf = body => Number(body?.learner_id ?? body?.learnerId ?? 0);
const owned = (item, userId) => !item.userId || Number(item.userId) === Number(userId);

export function queuedLearnerIds({ userId, entries, hosts, snapshot }) {
  const result = new Set();
  const records = [...(snapshot.assessments || []), ...(snapshot.learnerTombstones || []).flatMap(item => item.assessments || []),
    ...(snapshot.deletedLearners || []).flatMap(item => (item.assessmentIds || []).map(id => ({ id, learner_id: item.id })))];
  for (const entry of entries) {
    if (!owned(entry, userId)) continue;
    if (SESSION_KINDS.has(entry.kind)) {
      const host = hosts.find(item => String(item.code || "").toUpperCase() === codeOf(entry.body) && (!item.teacher_id || Number(item.teacher_id) === Number(userId)));
      for (const id of [learnerOf(entry.body), Number(host?.learner_id)]) if (id > 0) result.add(id);
    } else if (entry.kind === "save_assessment_records") {
      const ids = new Set((entry.body?.records || []).map(record => Number(record.id)));
      for (const record of records) if (ids.has(Number(record.id)) && Number(record.learner_id) > 0) result.add(Number(record.learner_id));
      for (const host of hosts) if ((!host.teacher_id || Number(host.teacher_id) === Number(userId)) &&
        [host.local_assessment_id, host.server_assessment_session_id].some(id => id && ids.has(Number(id))) && Number(host.learner_id) > 0) result.add(Number(host.learner_id));
    }
  }
  return [...result];
}

// Only call for an authenticated, verified missing learner, an acknowledged
// deletion, or a legacy archive that already established that absence.
export function planDeletedLearnerCleanup({ userId, learnerId, entries, hosts, snapshot, archives = [], now }) {
  const target = Number(learnerId);
  if (!Number.isInteger(target) || !target) return null;
  const relatedHosts = hosts.filter(host => Number(host.learner_id) === target && (!host.teacher_id || Number(host.teacher_id) === Number(userId)));
  const legacy = archives.filter(row => Number(row.value?.userId) === Number(userId) && Number(row.value?.learnerId) === target);
  const safeCode = code => code && !hosts.some(host => String(host.code || "").toUpperCase() === code &&
    (Number(host.learner_id) !== target || host.teacher_id && Number(host.teacher_id) !== Number(userId)));
  const codes = new Set(relatedHosts.map(host => codeOf(host)).filter(Boolean));
  for (const entry of entries) if (owned(entry, userId) && entry.kind === "host_start" && learnerOf(entry.body) === target && safeCode(codeOf(entry.body))) codes.add(codeOf(entry.body));
  for (const { value } of legacy) for (const item of [...(value.hosts || []), ...(value.entries || []).map(entry => entry.body), ...(value.secondaryEntries || []).map(entry => entry.payload)]) {
    const code = codeOf(item); if (safeCode(code)) codes.add(code);
  }
  const tombstone = (snapshot.learnerTombstones || []).find(item => Number(item.id) === target);
  const assessments = [...(tombstone?.assessments || []), ...(snapshot.assessments || []), ...legacy.flatMap(row => row.value.assessments || [])];
  const recordIds = new Set(assessments.filter(record => Number(record.learner_id) === target &&
    !(snapshot.assessments || []).some(current => Number(current.id) === Number(record.id) && Number(current.learner_id) !== target)).map(record => Number(record.id)));
  for (const host of relatedHosts) for (const id of [host.local_assessment_id, host.server_assessment_session_id]) if (id) recordIds.add(Number(id));
  for (const item of snapshot.deletedLearners || []) if (Number(item.id) === target) for (const id of item.assessmentIds || []) recordIds.add(Number(id));
  for (const record of snapshot.assessments || []) if (Number(record.learner_id) !== target) recordIds.delete(Number(record.id));
  const queueChanges = [];
  let removed = 0;
  for (const entry of entries) {
    if (!owned(entry, userId)) continue;
    if (entry.kind === "save_assessment_records") {
      const remaining = (entry.body?.records || []).filter(record => !recordIds.has(Number(record.id)));
      if (remaining.length === entry.body?.records?.length) continue;
      if (!entry.body?.records?.length) continue;
      removed += 1;
      queueChanges.push(remaining.length ? { key: `outbox:${entry.id}`, value: { ...entry, body: { ...entry.body, records: remaining } } } : { key: `outbox:${entry.id}`, remove: true });
    } else if (SESSION_KINDS.has(entry.kind) && (learnerOf(entry.body) === target || codes.has(codeOf(entry.body)))) {
      removed += 1; queueChanges.push({ key: `outbox:${entry.id}`, remove: true });
    }
  }
  // Only identifiers and a terminal deletion flag remain, so late callbacks
  // cannot recreate results and invitation codes cannot be reused locally.
  const markers = [...codes].map(code => ({ key: `host_session:${code}`, value: {
    code, teacher_id: Number(userId), learner_id: target, deleted: true, ended: true,
    connected: false, stage: "ended", local_pending_sync: false, offline_created: false,
    local_delete_pending: true, updated_at: new Date(now).toISOString(),
  } }));
  return { removed, codes: [...codes], changes: [
    { key: `teacher_snapshot:${userId}`, value: { ...snapshot, savedAt: now,
      ...(snapshot.classes ? {classes: {...snapshot.classes, archives: (snapshot.classes.archives || []).filter(item=>!(item.offline_pending && Number(item.sourceLearnerId)===target))}} : {}),
      learners: (snapshot.learners || []).filter(item => Number(item.id) !== target),
      assessments: (snapshot.assessments || []).filter(record => Number(record.learner_id) !== target),
      learnerTombstones: (snapshot.learnerTombstones || []).map(item => Number(item.id) === target ? { ...item, assessments: undefined } : item),
      deletedLearners: [...(snapshot.deletedLearners || []).filter(item => Number(item.id) !== target), { id: target, assessmentIds: [...recordIds] }],
    } },
    ...markers, ...queueChanges, ...legacy.map(row => ({ key: row.key, remove: true })),
  ] };
}
