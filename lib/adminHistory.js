import crypto from "node:crypto";
import { prisma } from "./prisma";

export const RECOVERY_DAYS = 30;
export const BACKUP_DAYS = 90;
export const learnerHistoryInclude = {
  assessmentSessions: { include: { sessionMetrics: true, letterResults: true, wordResults: true, passageMiscues: true, comprehensionResults: true } },
};
const DAY = 86400000;
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
function dataKey() {
  const secret = process.env.ADMIN_DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Private history encryption is unavailable.");
  return crypto.createHash("sha256").update(`crl-admin-history-v1:${secret}`).digest();
}
export function sealPrivateData(value) {
  const raw = Buffer.from(JSON.stringify(value));
  if (raw.length > MAX_SNAPSHOT_BYTES) throw Object.assign(new Error("Choose a smaller batch."), { status: 413 });
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", dataKey(), iv);
  cipher.setAAD(Buffer.from("crl-admin-history-v1"));
  const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function openPrivateData(value) {
  if (typeof value !== "string" || value.length > MAX_SNAPSHOT_BYTES * 2) throw new Error("Invalid recovery data.");
  const [version, iv, tag, raw, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !raw || extra) throw new Error("Invalid recovery data.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from("crl-admin-history-v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw, "base64url")), decipher.final()]).toString());
}
export function historyDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && time > Date.now() - 365 * DAY && time <= Date.now() + 300000 ? new Date(time) : new Date();
}
export async function writeAudit(tx, { actorId, teacherId = actorId, event, count = 1, detail = null, occurredAt }) {
  return tx.adminAuditEvent.create({ data: { actorId, teacherId, event, entityCount: count, occurredAt: historyDate(occurredAt), encryptedDetail: detail ? sealPrivateData(detail) : null } });
}
export async function recordLogin(user, scope) {
  if (user.role !== "teacher" || scope === "admin") return;
  await writeAudit(prisma, { actorId: user.id, event: "login", detail: { scope } });
}
export async function archiveSnapshot(tx, { actorId, teacherId, kind, count, snapshot }) {
  return tx.adminRecoveryItem.create({ data: {
    actorId, teacherId, kind, entityCount: count, encryptedSnapshot: sealPrivateData(snapshot),
    expiresAt: new Date(Date.now() + (kind === "backup" ? BACKUP_DAYS : RECOVERY_DAYS) * DAY),
  } });
}
export async function auditLearnerCreation(tx, teacherId, learners, body = {}) {
  if (!learners.length) return;
  const group = String(body._audit_import_group || "");
  if (!/^[a-f0-9-]{36}$/i.test(group)) {
    await writeAudit(tx, { actorId: teacherId, event: "learner.created", count: learners.length, detail: { learners }, occurredAt: body._audit_occurred_at });
    return;
  }
  const groupKey = `${teacherId}:import:${group}`;
  // Serialise only this import; unrelated teachers and assessment updates do not wait.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${groupKey}))::text AS locked`;
  const existing = await tx.adminAuditEvent.findUnique({ where: { groupKey } });
  const prior = existing ? openPrivateData(existing.encryptedDetail).learners || [] : [];
  const byId = new Map([...prior, ...learners].map(row => [row.id, row]));
  const all = [...byId.values()];
  if (all.length > 500) throw Object.assign(new Error("The import batch is too large."), { status: 413 });
  await tx.adminAuditEvent.upsert({ where: { groupKey },
    create: { actorId: teacherId, teacherId, groupKey, event: "learners.imported", entityCount: all.length, occurredAt: historyDate(body._audit_occurred_at), encryptedDetail: sealPrivateData({ learners: all }) },
    update: { entityCount: all.length, encryptedDetail: sealPrivateData({ learners: all }) },
  });
}
export async function deleteLearnersWithRecovery(teacherId, ids, body = {}) {
  if (ids.length > 500) throw Object.assign(new Error("Delete at most 500 learners at a time."), { status: 413 });
  return prisma.$transaction(async tx => {
    const live = await tx.hostSession.count({ where: { teacherId, learnerId: { in: ids }, ended: false, linkedAt: { not: null }, stage: { notIn: ["completed", "terminated", "teacher_review"] } } });
    if (live) throw Object.assign(new Error("End the active assessment before deleting its learner."), { status: 409 });
    const learners = await tx.learner.findMany({ where: { teacherId, id: { in: ids } }, include: learnerHistoryInclude });
    if (!learners.length) return;
    const archive = await archiveSnapshot(tx, { actorId: teacherId, teacherId, kind: "learners", count: learners.length, snapshot: { kind: "learners", learners } });
    await writeAudit(tx, { actorId: teacherId, event: learners.length === 1 ? "learner.deleted" : "learners.deleted", count: learners.length, detail: { learners, recoveryId: archive.id }, occurredAt: body._audit_occurred_at });
    await tx.learner.deleteMany({ where: { teacherId, id: { in: learners.map(row => row.id) } } });
  }, { timeout: 30000 });
}
export function contentDigest(rows) {
  const values = rows.map(({ teacherId, assessmentPeriod, category, position, content, storyTitle }) => ({ teacherId, assessmentPeriod, category, position, content, storyTitle: storyTitle || null }))
    .sort((a, b) => `${a.teacherId}:${a.assessmentPeriod}:${a.category}:${a.position}`.localeCompare(`${b.teacherId}:${b.assessmentPeriod}:${b.category}:${b.position}`));
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
export async function auditContentChange(tx, teacherId, period, before, after, body = {}) {
  if (contentDigest(before) === contentDigest(after)) return;
  const key = row => `${row.category}:${row.position}`;
  const old = new Map(before.map(row => [key(row), row])), next = new Map(after.map(row => [key(row), row]));
  const changes = [];
  for (const [k, row] of next) {
    const prior = old.get(k);
    if (!prior) changes.push({ action: "added", after: row });
    else if (prior.content !== row.content || (prior.storyTitle || "") !== (row.storyTitle || "")) changes.push({ action: "edited", before: prior, after: row });
  }
  for (const [k, row] of old) if (!next.has(k)) changes.push({ action: "deleted", before: row });
  const archive = await archiveSnapshot(tx, { actorId: teacherId, teacherId, kind: "content", count: changes.length, snapshot: { kind: "content", teacherId, period, rows: before, expectedDigest: contentDigest(after) } });
  await writeAudit(tx, { actorId: teacherId, event: "content.changed", count: changes.length, detail: { period, changes, recoveryId: archive.id }, occurredAt: body._audit_occurred_at });
}
const learnerFields = ["id", "lrn", "firstName", "middleName", "lastName", "suffix", "sex", "gradeLevel", "section", "teacherId", "createdAt"];
const sessionFields = ["id", "learnerId", "teacherId", "assessmentPeriod", "dateAdministered", "overallClassification", "isCompleted", "createdAt", "updatedAt"];
function pick(row, keys) { return Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]])); }
async function restoreLearners(tx, rows, merge) {
  let restored = 0;
  for (const row of rows) {
    const byId = await tx.learner.findUnique({ where: { id: row.id } });
    const byLrn = await tx.learner.findUnique({ where: { lrn: row.lrn } });
    if (byId || byLrn) {
      if (!merge || !byId || byId.lrn !== row.lrn || byId.teacherId !== row.teacherId || (byLrn && byLrn.id !== row.id)) {
        throw Object.assign(new Error("A learner ID or LRN is already in use. No records were overwritten."), { status: 409 });
      }
    } else { await tx.learner.create({ data: pick(row, learnerFields) }); restored++; }
    for (const session of row.assessmentSessions || []) {
      const existing = await tx.assessmentSession.findUnique({ where: { id: session.id } });
      if (existing) {
        if (!merge || existing.learnerId !== row.id || existing.teacherId !== row.teacherId) throw Object.assign(new Error("An assessment ID is already in use."), { status: 409 });
        continue;
      }
      await tx.assessmentSession.create({ data: {
        ...pick(session, sessionFields), learnerId: row.id, teacherId: row.teacherId,
        ...(session.sessionMetrics ? { sessionMetrics: { create: Object.fromEntries(Object.entries(session.sessionMetrics).filter(([key]) => key !== "sessionId")) } } : {}),
        ...Object.fromEntries(["letterResults", "wordResults", "passageMiscues", "comprehensionResults"].filter(key => session[key]?.length).map(key => [key, { create: session[key].map(result => Object.fromEntries(Object.entries(result).filter(([field]) => field !== "id" && field !== "sessionId"))) }])),
      } });
    }
  }
  return restored;
}
export async function restoreRecovery(itemId, adminId) {
  return prisma.$transaction(async tx => {
    const item = await tx.adminRecoveryItem.findUnique({ where: { id: itemId } });
    if (!item || item.expiresAt <= new Date()) throw Object.assign(new Error("This recovery item has expired or is unavailable."), { status: 404 });
    const claim = await tx.adminRecoveryItem.updateMany({ where: { id: itemId, restoredAt: null }, data: { restoredAt: new Date(), restoredById: adminId } });
    if (claim.count !== 1) throw Object.assign(new Error("This recovery item was already restored."), { status: 409 });
    const snapshot = openPrivateData(item.encryptedSnapshot);
    let count = 0;
    const contentOwners = snapshot.kind === "content" ? [snapshot.teacherId] : snapshot.kind === "backup" ? [...new Set((snapshot.content || []).map(row => row.teacherId))] : [];
    if (contentOwners.length && await tx.hostSession.count({ where: { teacherId: { in: contentOwners }, ended: false, linkedAt: { not: null }, stage: { notIn: ["completed", "terminated", "teacher_review"] } } })) {
      throw Object.assign(new Error("End active assessments before restoring their teacher's content."), { status: 409 });
    }
    if (snapshot.kind === "learners" || snapshot.kind === "backup") {
      count = await restoreLearners(tx, snapshot.learners || [], snapshot.kind === "backup");
      if (snapshot.kind === "backup") {
        for (const row of snapshot.content || []) {
          const identity = pick(row, ["teacherId", "assessmentPeriod", "category", "position"]);
          const existing = await tx.assessmentContent.findUnique({ where: { teacherId_assessmentPeriod_category_position: identity } });
          if (!existing) { await tx.assessmentContent.create({ data: { ...identity, content: row.content, storyTitle: row.storyTitle || null } }); count++; }
        }
      }
    } else if (snapshot.kind === "content") {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`crl:content:${snapshot.teacherId}:${snapshot.period}`}))::text AS locked`;
      const where = { teacherId: snapshot.teacherId, assessmentPeriod: snapshot.period, category: { not: "settings" } };
      const current = await tx.assessmentContent.findMany({ where });
      if (contentDigest(current) !== snapshot.expectedDigest) throw Object.assign(new Error("Content changed after this version. No newer content was overwritten."), { status: 409 });
      await tx.assessmentContent.deleteMany({ where });
      if (snapshot.rows.length) await tx.assessmentContent.createMany({ data: snapshot.rows.map(row => pick(row, ["teacherId", "assessmentPeriod", "category", "position", "content", "storyTitle"])) });
      count = snapshot.rows.length;
    } else if (snapshot.kind === "report") {
      const delegate = snapshot.type === "feedback" ? tx.feedback : tx.bugReport;
      if (await delegate.findUnique({ where: { id: snapshot.row.id } })) throw Object.assign(new Error("This report already exists."), { status: 409 });
      await delegate.create({ data: snapshot.row }); count = 1;
    } else throw Object.assign(new Error("Invalid recovery type."), { status: 400 });
    await writeAudit(tx, { actorId: adminId, teacherId: item.teacherId, event: "recovery.restored", count, detail: { recoveryId: item.id, kind: item.kind } });
    return { count, teacherId: item.teacherId };
  }, { timeout: 60000 });
}
export async function createBackup(adminId, teacherId = null) {
  return prisma.$transaction(async tx => {
    const where = teacherId ? { teacherId } : {};
    const total = await tx.learner.count({ where });
    if (total > 1000) throw Object.assign(new Error("Select one teacher for a smaller backup."), { status: 413 });
    const learners = await tx.learner.findMany({ where, include: learnerHistoryInclude });
    const content = await tx.assessmentContent.findMany({ where });
    const item = await archiveSnapshot(tx, { actorId: adminId, teacherId, kind: "backup", count: learners.length, snapshot: { kind: "backup", version: 1, learners, content } });
    await writeAudit(tx, { actorId: adminId, teacherId, event: "backup.created", count: learners.length, detail: { recoveryId: item.id } });
    return item;
  }, { timeout: 60000, isolationLevel: "RepeatableRead" });
}
export async function consumeInvite(tx, inviteId, userId) {
  const now = new Date();
  const claim = await tx.inviteCode.updateMany({ where: { id: inviteId, isUsed: false, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, data: { isUsed: true, usedById: userId, usedAt: now, expiresAt: now } });
  if (claim.count !== 1) throw Object.assign(new Error("This invite code is no longer available."), { status: 409 });
  await writeAudit(tx, { actorId: userId, event: "teacher.registered", detail: { inviteId } });
}
