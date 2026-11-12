import { writeAudit } from "./adminHistory";

/**
 * Only approved staff can operate CRL-App. The approval state is separate from
 * isActive so an existing disabled account never becomes a new signup request.
 */
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const ROLES = ["teacher", "reading_coordinator"];

export const reviewerRoles = actor => actor?.role === "admin"
  ? ROLES
  : actor?.role === "reading_coordinator" ? ["teacher"] : [];

export async function listStaffSignupRequests(db, actor) {
  const roles = reviewerRoles(actor);
  if (!roles.length || !actor?.isActive || !actor.schoolId) fail("Approval access is unavailable.", 403);
  return db.user.findMany({
    where: { schoolId: actor.schoolId, role: { in: roles }, isActive: false, approvalStatus: "pending" },
    select: {
      id: true, fullName: true, username: true, email: true,
      role: true, schoolId: true, schoolName: true, createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 150,
  });
}

export async function reviewStaffSignup(db, actor, body) {
  const id = Number(body?.id);
  const decision = String(body?.decision || "");
  const roles = reviewerRoles(actor);
  if (!Number.isSafeInteger(id) || id <= 0 || !["approve", "reject"].includes(decision)) {
    fail("Choose a valid account request and approval decision.");
  }
  if (!roles.length || !actor?.isActive || !actor.schoolId) fail("Approval access is unavailable.", 403);
  const approved = decision === "approve";
  return db.$transaction(async tx => {
    // Revalidate the reviewer within the transaction so a revoked session
    // cannot authorize a new staff member after its school assignment changes.
    const reviewer = await tx.user.findFirst({
      where: { id: actor.id, schoolId: actor.schoolId, role: actor.role, isActive: true, approvalStatus: "approved" },
      select: { id: true },
    });
    if (!reviewer) fail("Your reviewer access has changed. Sign in again.", 403);
    const where = {
      id, schoolId: actor.schoolId, role: { in: roles }, isActive: false, approvalStatus: "pending",
    };
    const pending = await tx.user.findFirst({ where, select: { id: true, role: true, schoolId: true } });
    if (!pending) fail("This account request has already been reviewed or belongs to another school.", 409);

    const changed = await tx.user.updateMany({
      where,
      data: {
        approvalStatus: approved ? "approved" : "rejected",
        isActive: approved,
        ...(approved && pending.role === "teacher" && actor.role === "reading_coordinator" ? { coordinatorId: actor.id } : {}),
        adminSessionVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) fail("This request was already reviewed. Refresh the list.", 409);
    await writeAudit(tx, {
      actorId: actor.id, teacherId: pending.id,
      event: approved ? "account.approved" : "account.rejected",
      detail: { role: pending.role, schoolId: pending.schoolId },
    });
    return { status: "ok", decision, id };
  }, { maxWait: 10000, timeout: 15000 });
}
