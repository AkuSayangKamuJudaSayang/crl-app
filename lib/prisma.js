import { PrismaClient } from "@prisma/client";

const globalForPrisma =
  globalThis;

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV ===
      "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

/*
 * Reuse one PrismaClient instance during Next.js development so hot reloads
 * do not continuously create new database connections.
 *
 * In production, Vercel keeps this module instance alive for the duration
 * of the serverless/runtime instance.
 */
export const prisma =
  globalForPrisma.prisma ||
  createPrismaClient();

if (
  process.env.NODE_ENV !==
  "production"
) {
  globalForPrisma.prisma =
    prisma;
}
