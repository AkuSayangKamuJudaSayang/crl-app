import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const MAX_LOGIN_FAILURES = 7;
export const UNLOCK_REQUEST_ROLES = ['teacher', 'reading_coordinator'];
export const loginLockMinutes = role => UNLOCK_REQUEST_ROLES.includes(role) ? 30 : 5;
export const isLoginLocked = (user, now = new Date()) => Boolean(user?.loginLockedUntil && new Date(user.loginLockedUntil) > now);
// Cryptographic separation prevents a request receipt being accepted as a
// session or 2FA token, even by older token readers without audience checks.
const secret = () => crypto.createHmac("sha256", process.env.JWT_SECRET || process.env.AUTH_SECRET).update("crl-account-unlock-request-v1").digest("hex");

// Every password check and unlock decision serializes on the same account row.
// Values are bound parameters, including IDs; no submitted SQL is interpolated.
export async function lockLoginUser(tx, id) {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${id} FOR UPDATE`;
  return tx.user.findUnique({ where: { id } });
}

export function loginLockPayload(user, now = new Date()) {
  const retry = Math.max(1, Math.ceil((new Date(user.loginLockedUntil) - now) / 1000));
  const canRequestUnlock = UNLOCK_REQUEST_ROLES.includes(user.role);
  return {
    code: "ACCOUNT_LOCKED",
    error: `Too many incorrect passwords. This account is temporarily locked for ${loginLockMinutes(user.role)} minutes.`,
    locked_until: new Date(user.loginLockedUntil).toISOString(),
    retry_after: retry,
    lock_minutes: loginLockMinutes(user.role),
    can_request_unlock: canRequestUnlock,
    ...(canRequestUnlock ? { unlock_token: jwt.sign({ purpose: "account-unlock-request", userId: user.id, lockId: user.loginLockId }, secret(), { algorithm: "HS256", audience: "crl-account-unlock", expiresIn: retry }) } : {}),
  };
}

export async function checkAccountPassword(db, id, password) {
  return db.$transaction(async tx => {
    const user = await lockLoginUser(tx, id);
    if (!user) return { valid: false };
    const now = new Date();
    if (isLoginLocked(user, now)) return { locked: loginLockPayload(user, now) };
    if (!user.passwordHash) throw new Error("Account password is unavailable.");
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (valid) {
      await tx.user.update({ where: { id }, data: { failedLoginAttempts: 0, loginLockedUntil: null, loginLockId: null } });
      return { valid: true, user };
    }
    // Expiry begins a fresh set of seven tries. Requests during a lock never
    // extend its deadline, including requests with the correct password.
    const count = (user.loginLockedUntil ? 0 : user.failedLoginAttempts) + 1;
    const locked = count >= MAX_LOGIN_FAILURES;
    const updated = await tx.user.update({ where: { id }, data: {
      failedLoginAttempts: Math.min(count, MAX_LOGIN_FAILURES),
      loginLockedUntil: locked ? new Date(now.getTime() + loginLockMinutes(user.role) * 60000) : null,
      loginLockId: locked ? crypto.randomUUID() : null,
    } });
    return locked ? { locked: loginLockPayload(updated, now) } : { valid: false, attempts_remaining: MAX_LOGIN_FAILURES - count };
  }, { maxWait: 10000, timeout: 15000 });
}

export async function requestAccountUnlock(db, token) {
  let claim;
  try {
    if (typeof token !== "string" || token.length > 2048) throw new Error();
    claim = jwt.verify(token, secret(), { algorithms: ["HS256"], audience: "crl-account-unlock" });
    if (claim.purpose !== "account-unlock-request" || !Number.isSafeInteger(claim.userId) || claim.userId <= 0 || typeof claim.lockId !== "string") throw new Error();
  } catch { throw Object.assign(new Error("Retry sign-in to check the current account lock."), { status: 400 }); }
  return db.$transaction(async tx => {
    const user = await lockLoginUser(tx, claim.userId);
    if (!UNLOCK_REQUEST_ROLES.includes(user?.role) || !isLoginLocked(user) || user.loginLockId !== claim.lockId) {
      throw Object.assign(new Error("This lock has ended. Please try signing in again."), { status: 409 });
    }
    // No password, free-text contact data, or identity-verification claim is saved.
    await tx.accountUnlockRequest.upsert({
      where: { teacherId_lockId: { teacherId: user.id, lockId: user.loginLockId } },
      create: { teacherId: user.id, lockId: user.loginLockId, lockedUntil: user.loginLockedUntil }, update: {},
    });
    return { status: "ok", message: "Your unlock request has been sent to the administrator. You can also wait until the lock expires." };
  }, { maxWait: 10000, timeout: 15000 });
}

export async function resolveAccountUnlock(db, id, adminId, approve, audit, reviewer = null) {
  return db.$transaction(async tx => {
    if(reviewer){
      if(reviewer.role!=='admin'||!reviewer.schoolId)throw Object.assign(new Error('System Administrator access required.'),{status:403});
      const current=await tx.user.findFirst({where:{id:adminId,role:'admin',schoolId:reviewer.schoolId,isActive:true,approvalStatus:'approved'},select:{id:true}});
      if(!current)throw Object.assign(new Error('Your administrator access has changed. Sign in again.'),{status:403});
    }
    const request = reviewer
      ? await tx.accountUnlockRequest.findFirst({where:{id,teacher:{schoolId:reviewer.schoolId,role:{in:UNLOCK_REQUEST_ROLES}}}})
      : await tx.accountUnlockRequest.findUnique({ where: { id } });
    if (!request) throw Object.assign(new Error("Unlock request unavailable."), { status: 404 });
    const user = await lockLoginUser(tx, request.teacherId);
    if (!UNLOCK_REQUEST_ROLES.includes(user?.role) || !isLoginLocked(user) || user.loginLockId !== request.lockId) {
      throw Object.assign(new Error("This lock has ended or changed. Refresh the requests."), { status: 409 });
    }
    const changed = await tx.accountUnlockRequest.updateMany({ where: { id, status: "pending" }, data: { status: approve ? "approved" : "dismissed", resolvedAt: new Date(), resolvedById: adminId } });
    if (changed.count !== 1) throw Object.assign(new Error("This request has already been reviewed."), { status: 409 });
    if (approve) await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, loginLockedUntil: null, loginLockId: null } });
    await audit(tx, { actorId: adminId, teacherId: user.id, event: approve ? "account.unlocked" : "account.unlock_dismissed", detail: { requestId: id } });
    return { status: "ok" };
  }, { maxWait: 10000, timeout: 15000 });
}
