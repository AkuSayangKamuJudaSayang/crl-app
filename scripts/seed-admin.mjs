/*
 * Provision or rotate a CRL-App administrator account.
 *
 * Bootstrap the first administrator explicitly. Additional administrators use
 * invitation-based enrollment in the platform console.
 *
 * Usage (from the repository root):
 *
 *   node --env-file=.env.local scripts/seed-admin.mjs
 *
 * Requires explicit CRL_BOOTSTRAP_USERNAME, CRL_BOOTSTRAP_PASSWORD and CRL_BOOTSTRAP_NAME.
 * Re-running it is safe: an existing username is updated rather than duplicated.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {getRegistrationPasswordError} from "../lib/registrationPassword.mjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
// Explicit bootstrap inputs only; no built-in credentials or promotion defaults.
const USERNAME = String(process.env.CRL_BOOTSTRAP_USERNAME || '').trim().toLowerCase();
const PASSWORD = String(process.env.CRL_BOOTSTRAP_PASSWORD || '');
const FULL_NAME = String(process.env.CRL_BOOTSTRAP_NAME || '').trim();

async function main() {
  if (!USERNAME || !FULL_NAME) throw new Error("Explicit bootstrap username and name are required.");
  const passwordError=getRegistrationPasswordError(PASSWORD,PASSWORD);
  if(passwordError)throw Error(passwordError);

  // Fail fast with a clear message when the database is unreachable.
  const total = await prisma.user.count();
  console.log(`connected. users table has ${total} row(s)`);

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  const existing = await prisma.user.findFirst({
    where: { username: { equals: USERNAME, mode: "insensitive" } },
    select: { id: true, username: true,role:true },
  });

  if(existing&&existing.role!=="admin")throw Error("This username belongs to another account type.");
  const admin = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, fullName: FULL_NAME,adminSessionVersion:{increment:1} },
      })
    : await prisma.user.create({
        data: { username: USERNAME, passwordHash, fullName: FULL_NAME, role: "admin" },
      });

  console.log(
    `${existing ? "updated" : "created"} admin: id=${admin.id} username=${admin.username} role=${admin.role}`
  );

  // Prove the stored hash matches, so a bad seed can never ship silently.
  const verifies = await bcrypt.compare(PASSWORD, admin.passwordHash);
  console.log(`password verifies: ${verifies}`);
  if (!verifies) throw new Error("Stored hash does not match the supplied password.");

  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true, username: true },
    orderBy: { id: "asc" },
  });
  console.log("administrators:", admins.map((row) => `${row.username} (#${row.id})`).join(", "));

  const [bugs, feedback] = await Promise.all([
    prisma.bugReport.count(),
    prisma.feedback.count(),
  ]);
  console.log(`inbox ready — bug_reports: ${bugs}, feedback: ${feedback}`);
}

main()
  .catch((error) => {
    console.error("ERROR:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
