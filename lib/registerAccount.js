import { sealPrivateData } from './adminHistory';
import { registrationPolicyError, REGISTRATION_POLICY_VERSION } from './registrationPolicy.mjs';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { getRegistrationName } from './registrationName.mjs';
import { getRegistrationPasswordError } from './registrationPassword.mjs';

const problem = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * Signup creates an INACTIVE, PENDING staff account. No invitation or client-
 * supplied approver is trusted. An authorized reviewer must activate the user
 * through the school-scoped, transactional staff-approval endpoint.
 */
export async function registerAccount(body, role) {
  if (role === 'admin') throw problem('Administrator accounts are provisioned by the school.', 403);
  if (!['teacher', 'reading_coordinator'].includes(role)) throw problem('Choose a valid account type.');
  const consentError = registrationPolicyError(body);
  if (consentError) throw problem(consentError);
  const name = getRegistrationName(body);
  const username = String(body?.username || '').trim().toLowerCase();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const schoolId = String(body?.school_id || '').trim();
  if (name.error) throw problem(name.error);
  if (!name.fullName || !/^[a-z0-9_.-]{3,50}$/.test(username) ||
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    throw problem('Enter your name, a valid username and email.');
  }
  const passwordError = getRegistrationPasswordError(password, body?.confirm_password);
  if (passwordError) throw problem(passwordError);
  if (!/^\d{6}$/.test(schoolId)) throw problem('Choose a registered school.');
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.$transaction(async tx => {
    const school = await tx.school.findFirst({ where: { id: schoolId, isActive: true } });
    if (!school) throw problem('This school is unavailable.');
    const now = new Date();
    const user = await tx.user.create({
      data: {
        username, email, passwordHash,
        policyAcceptedAt: now, policyVersion: REGISTRATION_POLICY_VERSION,
        fullName: name.fullName, ...name.fields,
        role, schoolId: school.id, schoolName: school.name,
        coordinatorId: null, isActive: false, approvalStatus: 'pending',
        twoFactorEnabled: false,
      },
    });
    // A signup must never automatically sign in or acquire a school session.
    await tx.adminAuditEvent.create({
      data: {
        actorId: user.id, teacherId: user.id, schoolId: user.schoolId,
        actorName: user.fullName, event: 'account.approval_requested',
        groupKey: `staff-signup:${user.id}`, occurredAt: now,
        encryptedDetail: sealPrivateData({ role, schoolId: user.schoolId }),
      },
    });
    return user;
  }, { maxWait: 10000, timeout: 15000 });
}
