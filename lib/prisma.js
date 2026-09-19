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
  const usable = configured
    .map(({ key, value }) => ({ key, value, info: classifyDatabaseUrl(value) }))
    .filter((entry) => entry.info && isUsableDatabaseUrl(entry.value));
  const selected =
    usable.find((entry) => !entry.info.transactionMode) || usable[0];

  return {
    configured: configured.length > 0,
    usable: Boolean(selected),
    selectedKey: selected?.key || null,
  };
}

/*
 * Supabase exposes two pooler endpoints, and the choice between them dominates
 * this application's latency.
 *
 * The transaction pooler (port 6543) cannot reuse prepared statements, so Prisma
 * is configured with `pgbouncer=true` for it. Measured against this project that
 * combination costs a large FIXED amount per query - about 495ms per query
 * versus about 101ms for the same host through the session pooler (port 5432),
 * independent of the query itself or of its result size.
 *
 * Because the penalty is per query rather than per row it multiplies through
 * every request: recording one comprehension answer runs about nine sequential
 * queries, which cost roughly 4.5s on the transaction pooler and about 0.9s on
 * the session pooler. Runtime therefore prefers a session-mode or direct
 * connection when one is configured, and falls back to the transaction pooler
 * with its required flag so behaviour is never worse than before.
 */
function classifyDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const isSupabasePooler = url.hostname.endsWith(".pooler.supabase.com");
    const port = url.port || "5432";
    const transactionMode =
      url.searchParams.get("pgbouncer") === "true" ||
      (isSupabasePooler && port === "6543");

    return { url, isSupabasePooler, port, transactionMode };
  } catch {
    return null;
  }
}

function runtimeDatabaseUrl() {
  const candidates = configuredDatabaseUrls()
    .map(({ key, value }) => ({ key, value, info: classifyDatabaseUrl(value) }))
    .filter((entry) => entry.info && isUsableDatabaseUrl(entry.value));

  if (!candidates.length) return undefined;

  const preferred =
    candidates.find((entry) => !entry.info.transactionMode) || candidates[0];
  const { url, isSupabasePooler, transactionMode } = preferred.info;

  if (transactionMode) {
    // Required for the transaction pooler; prepared statements cannot be reused.
    url.searchParams.set("pgbouncer", "true");
  }

  /*
   * Keep the per-instance pool small. A session-mode connection holds a server
   * connection for its lifetime, and several serverless instances share the
   * project's pooler budget. The timeout is generous so a brief burst waits for
   * a free connection instead of failing the request, which is what surfaced to
   * the user as an internal assessment server error.
   */
  if (
    transactionMode ||
    isSupabasePooler ||
    process.env.VERCEL ||
    process.env.CRL_FAST_DB_POOL === "1"
  ) {
    /*
     * Smaller for the session pooler: a session-mode client connection holds a
     * server connection for its whole lifetime and several serverless instances
     * share the project's pooler budget, whereas the transaction pooler
     * multiplexes.
     */
    url.searchParams.set("connection_limit", transactionMode ? "5" : "3");
    url.searchParams.set("pool_timeout", "15");
  }

  return url.toString();
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
