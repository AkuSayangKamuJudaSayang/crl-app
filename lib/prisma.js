import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const DATABASE_URL_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
];

const DATABASE_URL_PLACEHOLDER_PATTERN =
  /PROJECT_REF|YOUR_DATABASE_PASSWORD|YOUR_POOLER_HOST|replace-with/i;

function configuredDatabaseUrls() {
  return DATABASE_URL_KEYS.map((key) => ({
    key,
    value: String(process.env[key] || "").trim(),
  })).filter(({ value }) => Boolean(value));
}

function isUsableDatabaseUrl(value) {
  if (!value || DATABASE_URL_PLACEHOLDER_PATTERN.test(value)) return false;

  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      Boolean(url.username)
    );
  } catch {
    return false;
  }
}

export function getDatabaseConfigurationStatus() {
  const configured = configuredDatabaseUrls();
  const selected = configured.find(({ value }) => isUsableDatabaseUrl(value));

  return {
    configured: configured.length > 0,
    usable: Boolean(selected),
    selectedKey: selected?.key || null,
  };
}

function runtimeDatabaseUrl() {
  const configured = configuredDatabaseUrls();
  const selected = configured.find(({ value }) => isUsableDatabaseUrl(value));
  const raw = selected?.value;

  if (!raw) return raw;

  try {
    const url = new URL(raw);

    // CRL-App uses a small shared Supabase pooler in some deployments.
    // Keep one Prisma connection per serverless instance and fail quickly
    // enough that a transient network issue does not occupy the pool for 10s+.
    const isSupabasePooler = url.hostname.endsWith(".pooler.supabase.com");

    if (
      process.env.VERCEL ||
      process.env.CRL_FAST_DB_POOL === "1" ||
      isSupabasePooler
    ) {
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
    const status = getDatabaseConfigurationStatus();

    throw new Error(
      status.configured
        ? "The configured database URLs are invalid or still contain template placeholders. Replace PROJECT_REF, YOUR_DATABASE_PASSWORD, and YOUR_POOLER_HOST with real values."
        : "No database connection is configured. Set DATABASE_URL (preferred) or DIRECT_URL before using Prisma."
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
 * operation is requested at runtime. Missing database configuration still
 * throws a clear error at the point where the database is actually needed.
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
