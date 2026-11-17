/*
 * Cancellation is a terminal action, not an assessment result.
 * Keep only the start handshake (if it may need cloud replay) and one end
 * request for each abandoned run. This prevents dozens of old answer writes
 * from being replayed after the teacher has canceled the assessment.
 */
export function queuedAssessmentCode(entry) {
  const body = entry?.body || {};
  const value = entry?.kind === "host_start"
    ? body.offline_code || entry.offlineCode || body.code
    : body.code || body.offline_code || entry?.offlineCode;
  return String(value || "").trim().toUpperCase();
}

export function normalizeCanceledCodes(codes) {
  return [...new Set((Array.isArray(codes) ? codes : [codes])
    .map(code => String(code || "").trim().toUpperCase()).filter(Boolean))];
}

export function buildCanceledAssessmentPlan({
  userId, codes, entries = [], hosts = [], automaticTimeout = false,
  now = Date.now(),
}) {
  const targets = new Set(normalizeCanceledCodes(codes));
  const changes = [];
  const canceledCodes = [];
  const canceledAssessmentIds = [];
  const outboxByCode = new Map();
  const hostByCode = new Map();
  const ownerId = Number(userId);

  for (const entry of entries) {
    const code = queuedAssessmentCode(entry);
    if (!targets.has(code)) continue;
    if (!outboxByCode.has(code)) outboxByCode.set(code, []);
    outboxByCode.get(code).push(entry);
  }
  for (const host of hosts) {
    const code = String(host?.code || "").trim().toUpperCase();
    if (targets.has(code)) hostByCode.set(code, host);
  }

  let nextSequence = Math.max(now * 1000,
    ...entries.map(entry => Number(entry?.sequence || 0)).filter(Number.isFinite)) + 1;
  for (const code of targets) {
    const host = hostByCode.get(code);
    const pending = outboxByCode.get(code) || [];
    if (!host && !pending.length) continue;
    if (host && Number(host.teacher_id || host.teacherId) !== ownerId) continue;
    // An intentionally saved, completed run must never be discarded by a
    // delayed stale cancellation signal.
    if (host?.stage === "completed" && host?.ended) continue;
    if (pending.some(entry => entry.userId && Number(entry.userId) !== ownerId)) continue;

    canceledCodes.push(code);
    const assessmentId = Number(host?.local_assessment_id || 0);
    if (assessmentId) canceledAssessmentIds.push(assessmentId);
    const cloudAssessmentId = Number(host?.server_assessment_session_id || 0);
    if (cloudAssessmentId) canceledAssessmentIds.push(cloudAssessmentId);

    if (host) {
      changes.push({
        key: `host_session:${code}`,
        value: {
          ...host,
          ended: true, stage: "ended", canceled: true,
          connected: false, linked_at: null, local_pending_sync: true,
          current_content: automaticTimeout
            ? "Assessment ended after the connection was lost."
            : "Assessment canceled by teacher.",
          task1Results: [], task2Results: [], passageMiscues: [],
          comprehensionResults: [], metrics: {},
          updated_at: new Date(now).toISOString(),
        },
      });
    }

    // Preserve the start handshake if necessary: a cloud host that has never
    // been created must be started and immediately ended, without replaying
    // ANY answers, passage notes, final reviews or metrics.
    const start = pending.find(entry => entry.kind === "host_start");
    const oldEnd = pending.find(entry => entry.kind === "host_end");
    for (const entry of pending) {
      if (entry.id === start?.id || entry.id === oldEnd?.id) continue;
      changes.push({ key: `outbox:${entry.id}`, remove: true });
    }

    const endedBody = {
      ...(oldEnd?.body || {}),
      action: "host_end", code,
      ...(automaticTimeout || oldEnd?.body?.auto_timeout === true ? { auto_timeout: true } : {}),
    };
    const cancellation = oldEnd ? {
      ...oldEnd, userId: ownerId, body: endedBody,
      url: "/api/assessment?action=host_end", method: "POST",
    } : {
      id: `${now}-cancel-${code}`, userId: ownerId, kind: "host_end",
      url: "/api/assessment?action=host_end", method: "POST",
      body: endedBody, createdAt: now, sequence: nextSequence++,
    };
    changes.push({ key: `outbox:${cancellation.id}`, value: cancellation });
  }

  return { changes, canceledCodes, canceledAssessmentIds };
}
