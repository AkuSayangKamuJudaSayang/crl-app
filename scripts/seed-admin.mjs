/*
 * Provision or rotate a CRL-App administrator account.
 *
 * Administrator self-registration is disabled, so this script is the supported
 * way to create an admin or reset an admin password.
 *
 * Usage (from the repository root):
 *
 *   node --env-file=.env.local scripts/seed-admin.mjs
 *   node --env-file=.env.local scripts/seed-admin.mjs <username> <password> ["Full Name"]
 *
 * With no arguments it provisions the built-in administrator account.
 * Re-running it is safe: an existing username is updated rather than duplicated.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const DEFAULT_USERNAME = "adminCRL-APP_2026";
const DEFAULT_PASSWORD = "zq=Si$+yA=DJ)Sn@G#omJENSFm(";
const DEFAULT_FULL_NAME = "CRL-App Administrator";

const [, , argUsername, argPassword, ...nameParts] = process.argv;

const USERNAME = (argUsername || process.env.ADMIN_USERNAME || DEFAULT_USERNAME).trim();
const PASSWORD = argPassword || process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
const FULL_NAME =
  nameParts.join(" ").trim() || process.env.ADMIN_FULL_NAME || DEFAULT_FULL_NAME;

async function main() {
  if (!USERNAME) throw new Error("A username is required.");
  if (!PASSWORD || PASSWORD.length < 8) {
    throw new Error("A password of at least 8 characters is required.");
  }

  // Fail fast with a clear message when the database is unreachable.
  const total = await prisma.user.count();
  console.log(`connected. users table has ${total} row(s)`);

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  const existing = await prisma.user.findFirst({
    where: { username: { equals: USERNAME, mode: "insensitive" } },
    select: { id: true, username: true },
  });

  const admin = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, role: "admin", fullName: FULL_NAME },
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
