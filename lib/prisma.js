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
      url.searchParams.set("connection_limit", "3");
      url.searchParams.set("pool_timeout", "10");
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient() {
  const databaseUrl = runtimeDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Set the DATABASE_URL environment variable before using Prisma."
    );
  }

  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

/*
 * Lazy Prisma proxy:
 *
 * Next.js can evaluate API route modules while collecting page data during
 * `next build`. A database environment variable is not guaranteed to be
 * present at build time on every Vercel project. Constructing Prisma at
 * module load therefore makes an otherwise valid application build fail.
 *
 * The proxy delays PrismaClient construction until an actual database
 * operation is requested at runtime. Missing DATABASE_URL still throws a
 * clear error at the point where the database is actually needed.
 */
export const prisma = new Proxy(
  {},
  {
    get(_target, property) {
      const client = getPrismaClient();
      const value = client[property];

      if (typeof value === "function") {
        return value.bind(client);
      }

      return value;
    },
  }
);
