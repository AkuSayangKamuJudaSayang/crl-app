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

  // Mirror the runtime choice so reported configuration matches what is used.
  const preferSessionMode = process.env.CRL_DB_MODE === "session";
  const selected = preferSessionMode
    ? usable.find((entry) => !entry.info.transactionMode) || usable[0]
    : usable[0];

  return {
    configured: configured.length > 0,
    usable: Boolean(selected),
    selectedKey: selected?.key || null,
  };
}

/*
 * Supabase exposes two pooler endpoints, and the choice between them decides
 * whether this application stays up under load.
 *
 * Measured against this project (sequential host_get-style query / 12-query
 * concurrent burst / errors seen during those bursts):
 *
 *   transaction pooler :6543 with pgbouncer=true   1898ms / 3192ms /  0 errors
 *   transaction pooler :6543 without the flag       945ms / 1686ms / 27 errors
 *   session pooler      :5432                       819ms / 3869ms /  4 errors
 *
 * The flag-less transaction pooler breaks prepared statements ("prepared
 * statement s174 already exists"), and the session pooler is capped at
 * pool_size (15) clients IN TOTAL, so a deployment that scales to a few
 * instances starts failing with EMAXCONNSESSION. Only the documented
 * transaction-pooler mode survived concurrency, so that is the default.
 *
 * Its per-query cost is real, which is why the hot endpoints are kept to as few
 * sequential queries as possible rather than trading correctness for a faster
 * connection. CRL_DB_MODE=session opts into the session pooler for a
 * single-instance deployment that is guaranteed to stay under the cap.
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

  const preferSessionMode = process.env.CRL_DB_MODE === "session";
  const selected = preferSessionMode
    ? candidates.find((entry) => !entry.info.transactionMode) || candidates[0]
    : candidates[0];

  const { url, isSupabasePooler, transactionMode } = selected.info;

  if (transactionMode) {
    // Required for the transaction pooler; prepared statements cannot be reused.
    url.searchParams.set("pgbouncer", "true");
  }

  /*
   * Keep the per-instance pool small and give a brief burst room to wait for a
   * free connection instead of failing the request outright, which is what
   * surfaced to the user as an internal assessment server error.
   */
  if (
    transactionMode ||
    isSupabasePooler ||
    process.env.VERCEL ||
    process.env.CRL_FAST_DB_POOL === "1"
  ) {
    url.searchParams.set(
      "connection_limit",
      preferSessionMode && !transactionMode ? "3" : "5"
    );
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

/*
 * Transient connection failures must never reach the teacher as an error.
 *
 * A shared pooler can momentarily refuse a connection - the pool is full, a
 * session-mode client cap is reached, or the pooler recycles a backend. These
 * all fail BEFORE the statement runs, so retrying is safe even for writes, and
 * a user-visible "Internal assessment server error." in the middle of an
 * assessment is far worse than a short retry.
 */
const RETRYABLE_DB_PATTERNS = [
  /EMAXCONNSESSION/i,
  /max clients reached/i,
  /too many clients/i,
  /remaining connection slots/i,
  /Timed out fetching a new connection/i,
  /prepared statement .* already exists/i,
  /Connection terminated/i,
  /Connection reset/i,
  /server closed the connection/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /Can't reach database server/i,
  /Error in connector/i,
];

const RETRYABLE_DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_BASE_DELAY_MS = 120;

function isRetryableDatabaseError(error) {
  if (!error) return false;

  const code = String(error.code || "");
  if (RETRYABLE_DB_CODES.has(code)) return true;

  const message = `${String(error.message || "")} ${String(
    error.meta?.message || ""
  )}`;

  return RETRYABLE_DB_PATTERNS.some((pattern) => pattern.test(message));
}

async function withDatabaseRetry(operation) {
  let lastError = null;

  for (let attempt = 0; attempt < DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableDatabaseError(error) || attempt === DB_RETRY_ATTEMPTS - 1) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, DB_RETRY_BASE_DELAY_MS * 2 ** attempt)
      );
    }
  }

  throw lastError;
}

/*
 * Wrap a Prisma model delegate (prisma.hostSession, prisma.user, ...) so every
 * query it runs is retried on transient connection errors. Retrying at this
 * level covers every call site - present and future - without touching the
 * route handlers, and it leaves non-promise members ($ syntax, fields) intact.
 */
function wrapModelDelegate(delegate) {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") return value;

      return (...args) => withDatabaseRetry(() => value.apply(target, args));
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
 *
 * Model delegates are additionally wrapped with the connection retry above.
 *
 * `$`-functions are deliberately NOT retried: `$transaction([...])` takes an
 * array of already-created PrismaPromises, and replaying consumed promises is
 * not supported, so a retry there could corrupt a save. Transactions are used
 * only by the explicit save/finalize paths, while every hot endpoint that could
 * surface a transient pooler refusal is a single model query and is covered.
 */
function wrapPrismaClient(client) {
  const modelDelegates = new Map();

  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function") {
        return value.bind(target);
      }

      if (
        value &&
        typeof value === "object" &&
        typeof property === "string" &&
        !property.startsWith("$") &&
        !property.startsWith("_")
      ) {
        if (!modelDelegates.has(property)) {
          modelDelegates.set(property, wrapModelDelegate(value));
        }
        return modelDelegates.get(property);
      }

      return value;
    },
  });
}

/*
 * The wrapped client is cached per underlying client so a hot request path does
 * not allocate a new proxy graph on every single property access.
 */
function getWrappedPrismaClient() {
  const client = getPrismaClient();

  if (
    !globalForPrisma.prismaWrapped ||
    globalForPrisma.prismaWrappedFor !== client
  ) {
    globalForPrisma.prismaWrapped = wrapPrismaClient(client);
    globalForPrisma.prismaWrappedFor = client;
  }

  return globalForPrisma.prismaWrapped;
}

export const prisma = new Proxy(
  {},
  {
    get(_target, property) {
      return getWrappedPrismaClient()[property];
    },
  }
);
