import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma";
import { getAdminUser, adminProfileSelect } from "../../../lib/adminAuth";
import { archiveSnapshot, createBackup, openPrivateData, restoreRecovery, writeAudit, learnerHistoryInclude } from "../../../lib/adminHistory";
import { logSecureError } from "../../../lib/security";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function json(data, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
function positive(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function uuid(value) { return typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value); }
const activeInviteWhere = () => ({ isUsed: false, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });
const visibleAuditWhere = { NOT: { event: "login", teacherId: null } };
function inviteView(row) {
  return { id: row.id, code: row.code, is_used: row.isUsed, status: row.isUsed ? "used" : row.revokedAt ? "revoked" : row.expiresAt && row.expiresAt <= new Date() ? "expired" : "active", created_at: row.createdAt, expires_at: row.expiresAt, used_at: row.usedAt, revoked_at: row.revokedAt, teacher: row.redeemedBy || null };
}
function recoveryView(row) { return { id: row.id, teacher_id: row.teacherId, kind: row.kind, count: row.entityCount, created_at: row.createdAt, expires_at: row.expiresAt, restored_at: row.restoredAt }; }
function learnerView(row) {
  return { id: row.id, first_name: row.firstName, middle_name: row.middleName, last_name: row.lastName, suffix: row.suffix, sex: row.sex, section: row.section, lrn: row.lrn ? `••••••••${row.lrn.slice(-4)}` : "", assessments: (row.assessmentSessions || []).map(s => ({ id: s.id, period: s.assessmentPeriod, date: s.dateAdministered, classification: s.overallClassification, completed: s.isCompleted, metrics: s.sessionMetrics, letters: s.letterResults, words: s.wordResults, miscues: s.passageMiscues, comprehension: s.comprehensionResults })) };
}
async function details(event, page) {
  const detail = event.encryptedDetail ? openPrivateData(event.encryptedDetail) : {};
  if (detail.learners) {
    const start = page * 25, rows = detail.learners.slice(start, start + 25);
    if (["learner.created", "learners.imported"].includes(event.event) && rows.length) {
      const current = await prisma.learner.findMany({ where: { teacherId: event.teacherId, id: { in: rows.map(row => row.id) } }, include: learnerHistoryInclude });
      const sessions = new Map(current.map(row => [row.id, row.assessmentSessions]));
      for (const row of rows) row.assessmentSessions = sessions.get(row.id) || [];
    }
    return { learners: rows.map(learnerView), total: detail.learners.length, page, recoveryId: detail.recoveryId };
  }
  return detail;
}
async function overview(user) {
  // Retention cleanup happens on admin visits, never in live assessments.
  await prisma.adminRecoveryItem.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.adminAuditEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86400000) } } });
  const [teachers, invites, teacherCount, activeCount, auditCount, recoveryCount, bugs, feedback] = await Promise.all([
    prisma.user.findMany({ where: { role: "teacher" }, select: adminProfileSelect, orderBy: { fullName: "asc" }, take: 500 }),
    prisma.inviteCode.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { redeemedBy: { select: adminProfileSelect } } }),
    prisma.user.count({ where: { role: "teacher" } }), prisma.inviteCode.count({ where: activeInviteWhere() }),
    prisma.adminAuditEvent.count({ where: visibleAuditWhere }), prisma.adminRecoveryItem.count({ where: { restoredAt: null, expiresAt: { gt: new Date() } } }),
    prisma.bugReport.findMany({ orderBy: { createdAt: "desc" }, take: 50 }), prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { admin: user, teachers, invites: invites.map(inviteView), stats: { teachers: teacherCount, activeInvites: activeCount, auditEvents: auditCount, recoveryItems: recoveryCount }, bug_reports: bugs, feedback };
}
export async function GET(request) {
  try {
    const user = await getAdminUser(request);
    if (!user) return json({ error: "Administrator sign-in is required." }, 401);
    const params = request.nextUrl.searchParams, action = params.get("action") || "overview";
    const teacherId = params.has("teacher_id") ? positive(params.get("teacher_id")) : null;
    if (params.has("teacher_id") && !teacherId) return json({ error: "Choose a valid teacher." }, 400);
    const cursor = params.get("cursor");
    if (cursor && !uuid(cursor)) return json({ error: "Invalid page cursor." }, 400);
    if (action === "overview") return json(await overview(user));
    if (action === "audit") {
      const rows = await prisma.adminAuditEvent.findMany({ where: { ...visibleAuditWhere, ...(teacherId ? { teacherId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, actorId: true, teacherId: true, event: true, entityCount: true, occurredAt: true, createdAt: true } });
      return json({ entries: rows.slice(0, 50), next_cursor: rows.length > 50 ? rows[49].id : null });
    }
    if (action === "audit_detail") {
      const id = params.get("id");
      if (!uuid(id)) return json({ error: "Invalid entry." }, 400);
      const row = await prisma.adminAuditEvent.findUnique({ where: { id } });
      if (!row || (row.event === "login" && row.teacherId == null)) return json({ error: "Entry unavailable." }, 404);
      const page = Math.min(200, Math.max(0, Number(params.get("page")) || 0));
      return json({ entry: { id: row.id, event: row.event, occurred_at: row.occurredAt, created_at: row.createdAt, teacher_id: row.teacherId, count: row.entityCount }, detail: await details(row, Math.floor(page)) });
    }
    if (action === "recovery") {
      const rows = await prisma.adminRecoveryItem.findMany({ where: { expiresAt: { gt: new Date() }, ...(teacherId ? { teacherId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, teacherId: true, kind: true, entityCount: true, createdAt: true, expiresAt: true, restoredAt: true } });
      return json({ entries: rows.slice(0, 50).map(recoveryView), next_cursor: rows.length > 50 ? rows[49].id : null });
    }
    if (action === "recovery_detail") {
      const id = params.get("id");
      if (!uuid(id)) return json({ error: "Invalid recovery item." }, 400);
      const item = await prisma.adminRecoveryItem.findFirst({ where: { id, expiresAt: { gt: new Date() } } });
      if (!item) return json({ error: "Recovery item unavailable." }, 404);
      const snapshot = openPrivateData(item.encryptedSnapshot), page = Math.min(200, Math.max(0, Math.floor(Number(params.get("page")) || 0)));
      const detail = snapshot.learners ? { learners: snapshot.learners.slice(page * 25, (page + 1) * 25).map(learnerView), total: snapshot.learners.length, page }
        : snapshot.kind === "content" ? { period: snapshot.period, changes: snapshot.rows.map(row => ({ action: "saved version", before: row })) }
        : snapshot.kind === "report" ? { report: { type: snapshot.type, name: snapshot.row.name, message: snapshot.row.message } } : {};
      return json({ item: recoveryView(item), detail });
    }
    if (action === "download_backup") {
      const id = params.get("id");
      if (!uuid(id)) return json({ error: "Invalid backup." }, 400);
      const row = await prisma.adminRecoveryItem.findFirst({ where: { id, kind: "backup", expiresAt: { gt: new Date() } } });
      if (!row) return json({ error: "Backup unavailable." }, 404);
      return new NextResponse(JSON.stringify({ format: "crl-admin-backup-v1", encrypted_backup: row.encryptedSnapshot }), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="crl-backup-${row.id}.crlbackup"`, "Cache-Control": "private, no-store" } });
    }
    return json({ error: "Unknown administrator action." }, 400);
  } catch (error) { logSecureError("Admin read failed", error); return json({ error: "Unable to load administrator data." }, 500); }
}
export async function POST(request) {
  try {
    const user = await getAdminUser(request);
    if (!user) return json({ error: "Administrator sign-in is required." }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Enter a valid request." }, 400); }
    if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "Enter a valid request." }, 400);
    const action = body.action;
    if (action === "generate_code" || action === "reset_code") {
      const invite = await prisma.$transaction(async tx => {
        await tx.inviteCode.updateMany({ where: activeInviteWhere(), data: { revokedAt: new Date() } });
        const part = () => Array.from(crypto.randomBytes(4), byte => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");
        const row = await tx.inviteCode.create({ data: { code: `CRLA-${part()}-${part()}`, generatedBy: user.id }, include: { redeemedBy: { select: adminProfileSelect } } });
        await writeAudit(tx, { actorId: user.id, teacherId: null, event: "invite.generated", detail: { inviteId: row.id } });
        return row;
      });
      return json({ status: "ok", code: inviteView(invite) });
    }
    if (action === "revoke_code") {
      const id = positive(body.id);
      if (!id) return json({ error: "Choose an invite code." }, 400);
      await prisma.$transaction(async tx => {
        const result = await tx.inviteCode.updateMany({ where: { id, ...activeInviteWhere() }, data: { revokedAt: new Date() } });
        if (result.count !== 1) throw Object.assign(new Error("Only an unused, active code can be revoked."), { status: 409 });
        await writeAudit(tx, { actorId: user.id, teacherId: null, event: "invite.revoked", detail: { inviteId: id } });
      });
      return json({ status: "ok" });
    }
    if (action === "restore") {
      if (!uuid(body.id)) return json({ error: "Choose a recovery item." }, 400);
      return json({ status: "ok", ...await restoreRecovery(body.id, user.id) });
    }
    if (action === "create_backup") {
      const teacherId = body.teacher_id == null ? null : positive(body.teacher_id);
      if (body.teacher_id != null && !teacherId) return json({ error: "Choose a valid teacher." }, 400);
      if (teacherId && !await prisma.user.findFirst({ where: { id: teacherId, role: "teacher" }, select: { id: true } })) return json({ error: "Teacher unavailable." }, 404);
      const item = await createBackup(user.id, teacherId);
      return json({ status: "ok", item: recoveryView(item) });
    }
    if (action === "import_backup") {
      const snapshot = openPrivateData(body.encrypted_backup);
      if (snapshot.kind !== "backup" || snapshot.version !== 1 || !Array.isArray(snapshot.learners) || !Array.isArray(snapshot.content)) return json({ error: "Choose a CRL-App encrypted backup." }, 400);
      const item = await archiveSnapshot(prisma, { actorId: user.id, teacherId: null, kind: "backup", count: snapshot.learners.length, snapshot });
      return json({ status: "ok", item: recoveryView(item) });
    }
    if (action === "update_report" || action === "delete_report") {
      const id = positive(body.id), model = ["bug", "bug_report"].includes(body.type) ? prisma.bugReport : body.type === "feedback" ? prisma.feedback : null;
      if (!id || !model) return json({ error: "Choose a valid report." }, 400);
      if (action === "delete_report") await prisma.$transaction(async tx => {
        const delegate = body.type === "feedback" ? tx.feedback : tx.bugReport;
        const row = await delegate.findUnique({ where: { id } });
        if (!row) throw Object.assign(new Error("Report unavailable."), { status: 404 });
        const archive = await archiveSnapshot(tx, { actorId: user.id, teacherId: null, kind: "report", count: 1, snapshot: { kind: "report", type: body.type === "feedback" ? "feedback" : "bug", row } });
        await writeAudit(tx, { actorId: user.id, teacherId: null, event: "report.deleted", detail: { recoveryId: archive.id } });
        await delegate.delete({ where: { id } });
      });
      else await model.update({ where: { id }, data: { isResolved: Boolean(body.is_resolved) } });
      return json({ status: "ok" });
    }
    return json({ error: "Unknown administrator action." }, 400);
  } catch (error) {
    logSecureError("Admin update failed", error);
    if ([400, 404, 409, 413].includes(error?.status)) return json({ error: error.message }, error.status);
    return json({ error: "Unable to complete this action. No recovery data was overwritten." }, 500);
  }
}
