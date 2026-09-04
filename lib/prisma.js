import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

function runtimeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    // CRL-App uses a small shared Supabase pooler in some deployments.
    // Keep one Prisma connection per serverless instance and fail quickly
    // enough that a transient network issue does not occupy the pool for 10s+.
    if (process.env.VERCEL || process.env.CRL_FAST_DB_POOL === "1") {
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
      if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "5");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: { url: runtimeDatabaseUrl() },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
