const SESSION_KINDS = new Set([
  "host_start", "host_join", "learner_join", "host_update", "host_advance", "host_end",
  "record_letter", "record_word", "select_story", "passage_ready", "passage_timer", "finish_passage",
  "record_passage_miscue", "remove_passage_miscue", "record_miscue", "remove_miscue",
  "record_comprehension", "save_experience_rating", "finalize", "save_final_assessment_review", "assessment_commit",
]);
const codeOf = body => String(body?.offline_code || body?.code || "").trim().toUpperCase();
const learnerOf = body => Number(body?.learner_id ?? body?.learnerId ?? 0);
const owned = (entry, userId) => !entry.userId || Number(entry.userId) === Number(userId);

// Pure planning: the caller commits the archive, snapshot and queue edits in
// ONE IndexedDB transaction. No unavailable learner is recreated or reassigned.
export function planLearnerRecovery({ userId, learnerId, entries, hosts, snapshot, id, now, reason }) {
  const target = Number(learnerId);
  const relatedHosts = hosts.filter(host => Number(host.learner_id) === target && (!host.teacher_id || Number(host.teacher_id) === Number(userId)));
  const codes = new Set(relatedHosts.map(host => String(host.code || "").toUpperCase()).filter(Boolean));
  entries.filter(entry => owned(entry, userId) && entry.kind === "host_start" && learnerOf(entry.body) === target)
    .forEach(entry => { const code = codeOf(entry.body); if (code) codes.add(code); });
  const tombstone = (snapshot.learnerTombstones || []).find(item => Number(item.id) === target);
  const assessments = [...new Map([...(tombstone?.assessments || []), ...(snapshot.assessments || [])]
    .filter(record => Number(record.learner_id) === target).map(record => [Number(record.id), record])).values()];
  const recordIds = new Set(assessments.map(record => Number(record.id)));
  relatedHosts.forEach(host => [host.local_assessment_id, host.server_assessment_session_id].filter(Boolean).forEach(value => recordIds.add(Number(value))));
  const saved = [], queueChanges = [];
  for (const entry of entries) {
    if (!owned(entry, userId)) continue;
    if (entry.kind === "save_assessment_records") {
      const affected = (entry.body?.records || []).filter(record => recordIds.has(Number(record.id)));
      if (!affected.length) continue;
      saved.push({ ...entry, body: { ...entry.body, records: affected } });
      const remaining = entry.body.records.filter(record => !recordIds.has(Number(record.id)));
      queueChanges.push(remaining.length ? { key: `outbox:${entry.id}`, value: { ...entry, body: { ...entry.body, records: remaining } } } : { key: `outbox:${entry.id}`, remove: true });
    } else if (SESSION_KINDS.has(entry.kind) && (learnerOf(entry.body) === target || codes.has(codeOf(entry.body)))) {
      saved.push(entry); queueChanges.push({ key: `outbox:${entry.id}`, remove: true });
    }
  }
  if (!saved.length) return null;
  const learner = (snapshot.learners || []).find(item => Number(item.id) === target) || relatedHosts.find(host => host.learner)?.learner || assessments.find(record => record.learner)?.learner || (tombstone ? { ...tombstone, assessments: undefined } : { id: target });
  const archive = { version: 1, id, userId: Number(userId), learnerId: target, learner, reason, savedAt: now, entries: saved, hosts: relatedHosts, assessments };
  const nextSnapshot = { ...snapshot, savedAt: now,
    learners: (snapshot.learners || []).filter(item => Number(item.id) !== target),
    assessments: (snapshot.assessments || []).filter(record => Number(record.learner_id) !== target),
  };
  return { archive, changes: [
    { key: `sync_recovery:${userId}:${id}`, value: archive },
    { key: `teacher_snapshot:${userId}`, value: nextSnapshot },
    ...relatedHosts.map(host => ({ key: `host_session:${String(host.code).toUpperCase()}`, value: { ...host, offline_recovery_id: id, ended: true, connected: false, local_pending_sync: false, offline_created: false, stage: "ended", current_content: "This learner is no longer available in this teacher account. Offline work is saved for review." } })),
    ...queueChanges,
  ] };
}

export function planRecoveryRetry({ archive, userId, roster, snapshot, pending }) {
  if (Number(archive?.userId) !== Number(userId)) throw new Error("These saved items belong to another teacher account.");
  const learner = roster.find(item => Number(item.id) === Number(archive.learnerId));
  const originalLrn = String(archive.learner?.lrn || archive.learner?.LRN || "").trim();
  if (!learner || originalLrn && String(learner.lrn || learner.LRN || "").trim() !== originalLrn) {
    throw new Error("Restore this learner to the same teacher account before retrying. The saved items are still safe on this device.");
  }
  if (pending.some(entry => ["delete_learner", "delete_learners"].includes(entry.kind) &&
    (learnerOf(entry.body) === Number(archive.learnerId) || entry.body?.learner_ids?.map(Number).includes(Number(archive.learnerId))))) {
    throw new Error("This learner has a pending deletion. Finish that change before retrying saved items.");
  }
  const records = new Map((snapshot.assessments || []).map(record => [Number(record.id), record]));
  for (const record of archive.assessments) {
    const current = records.get(Number(record.id));
    if (current && Number(current.learner_id) !== Number(archive.learnerId)) throw new Error("An assessment ID is now used by a different learner.");
    if (current && current.assessment_period !== record.assessment_period) throw new Error("An assessment ID is now used by a different assessment period.");
    if (!current || record.offline_pending && !current.offline_pending) records.set(Number(record.id), { ...record });
  }
  return [
    { key: `teacher_snapshot:${userId}`, value: { ...snapshot, learners: [...(snapshot.learners || []).filter(item => Number(item.id) !== Number(learner.id)), learner], assessments: [...records.values()] } },
    ...archive.hosts.map(host => ({ key: `host_session:${String(host.code).toUpperCase()}`, value: { ...host, offline_recovery_id: null, learner, local_pending_sync: true } })),
    ...archive.entries.map(entry => { const id = `${entry.id}:recovery:${archive.id}`; return { key: `outbox:${id}`, value: { ...entry, id, userId: Number(userId) } }; }),
    { key: `sync_recovery:${userId}:${archive.id}`, remove: true },
  ];
}
