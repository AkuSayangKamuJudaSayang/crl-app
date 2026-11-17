const fs = require('node:fs');
const assert = require('node:assert/strict');
const migration = fs.readFileSync('supabase/migrations/20261117213000_allow_pending_staff_signup_approval.sql','utf8');
const required = [
  "CREATE OR REPLACE FUNCTION crl_private.guard_account_school()",
  "LANGUAGE plpgsql SECURITY INVOKER",
  "current_user = 'crl_school'",
  "NEW.role <> 'teacher'",
  "NEW.role IS DISTINCT FROM OLD.role",
  "NEW.school_id IS DISTINCT FROM OLD.school_id",
  "NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id",
  "OLD.approval_status = 'pending'",
  "OLD.is_active = false",
  "OLD.coordinator_id IS NULL",
  "NEW.approval_status = 'approved'",
  "NEW.is_active = true",
  "NEW.coordinator_id IS NOT NULL",
  "NEW.approval_status NOT IN ('pending', 'rejected')",
  "NEW.is_active OR",
  "c.id = NEW.coordinator_id",
  "c.role = 'reading_coordinator'",
  "c.school_id = NEW.school_id"
];
for (const marker of required) assert(migration.includes(marker), 'Database guard must preserve: ' + marker);
assert(!/\b(drop|truncate|delete\s+from|update\s+public\.users|alter\s+table)\b/i.test(migration), 'No data mutation or broad schema changes in this migration');
const signup=fs.readFileSync('lib/registerAccount.js','utf8');
assert(signup.includes("coordinatorId: null, isActive: false, approvalStatus: 'pending'"), 'New teacher/coordinator applications are inactive and unassigned');
assert(signup.includes('prisma.$transaction(async tx =>'), 'Account and audit must be atomic');
const approval=fs.readFileSync('lib/staffSignupApproval.js','utf8');
assert(approval.includes('reviewerRoles = actor')&&approval.includes('["reading_coordinator"]')&&approval.includes('["teacher"]'));
assert(approval.includes('coordinatorId: actor.id'), 'Reviewer approval must claim the teacher');
assert(approval.includes('approvalStatus: approved ? "approved" : "rejected"'));
assert(approval.includes('isActive: approved'));
assert(approval.includes('reviewer = await tx.user.findFirst'), 'Approver must be revalidated inside the transaction');
assert(approval.includes('pending = await tx.user.findFirst'), 'A pending request must exist');
const teacher=fs.readFileSync('app/api/auth/register/route.js','utf8');
const coordinator=fs.readFileSync('app/api/access/route.js','utf8');
assert(teacher.includes("registerAccount(body,'teacher')")&&teacher.includes("'pending_approval'"));
assert(coordinator.includes("registerAccount(body,role)")&&coordinator.includes("'pending_approval'"));
assert(teacher.includes("logSecureError('Teacher signup transaction failed',e)"), 'Unexpected signup errors should have safe diagnostics');
assert(coordinator.includes("logSecureError('Reading Coordinator signup transaction failed',error)"), 'Coordinator signup errors should have safe diagnostics');
console.log('PASS signup DB guard: inactive teacher pending/rejected, atomic coordinator claim, school/role boundary, reviewer authorization and safe error logging');
