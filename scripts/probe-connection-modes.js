/*
 * Decide the runtime connection mode.
 *
 * Supabase offers a transaction pooler (multiplexed, but Prisma must run without
 * prepared statements via `pgbouncer=true`) and a session pooler (fast, but
 * capped at pool_size clients in total). This measures latency AND concurrency
 * safety for each so the runtime choice is based on evidence.
 */

const fs = require("node:fs");
const path = require("node:path");

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnvLocal();

const { PrismaClient } = require("@prisma/client");

function buildUrl(rawUrl, { port, pgbouncer, limit }) {
  const u = new URL(rawUrl);
  if (port) u.port = String(port);
  u.search = "";
  if (pgbouncer) u.searchParams.set("pgbouncer", "true");
  u.searchParams.set("connection_limit", String(limit));
  u.searchParams.set("pool_timeout", "15");
  return u.toString();
}

async function measure(label, url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  const errors = [];
  let sequentialMedian = null;
  let burstWorst = 0;

  try {
    // Warm the pool.
    for (let i = 0; i < 3; i += 1) await client.$queryRaw`SELECT 1`;

    // Sequential latency.
    const samples = [];
    for (let i = 0; i < 6; i += 1) {
      const started = Date.now();
      await client.hostSession.findFirst({
        where: { code: "NHGZWV" },
        include: {
          learner: true,
          assessmentSession: {
            include: {
              sessionMetrics: true,
              letterResults: true,
              wordResults: true,
              comprehensionResults: true,
              passageMiscues: true,
            },
          },
        },
      });
      samples.push(Date.now() - started);
    }
    samples.sort((a, b) => a - b);
    sequentialMedian = samples[Math.floor(samples.length / 2)];

    // Concurrency safety: the burst that broke the session pooler.
    for (let round = 0; round < 3; round += 1) {
      const started = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          i % 3 === 0
            ? client.user.count()
            : client.hostSession.findFirst({
                where: { code: "NHGZWV" },
                include: { learner: true, assessmentSession: { include: { letterResults: true } } },
              })
        )
      );
      burstWorst = Math.max(burstWorst, Date.now() - started);
      for (const result of results) {
        if (result.status === "rejected") {
          errors.push(String(result.reason?.message || result.reason).split("\n").slice(-1)[0].slice(0, 140));
        }
      }
    }
  } catch (error) {
    errors.push(String(error?.message || error).slice(0, 160));
  } finally {
    await client.$disconnect().catch(() => null);
  }

  console.log(`${label}`);
  console.log(`   sequential host_get-style query: median ${sequentialMedian}ms`);
  console.log(`   12-query concurrent burst worst: ${burstWorst}ms`);
  console.log(`   errors: ${errors.length}${errors.length ? " -> " + errors.slice(0, 2).join(" | ") : ""}`);
  console.log("");

  return { sequentialMedian, errors: errors.length };
}

async function main() {
  const appUrl = process.env.DATABASE_URL;

  await measure(
    "A) transaction pooler :6543 WITH pgbouncer=true (Prisma-documented mode)",
    buildUrl(appUrl, { port: 6543, pgbouncer: true, limit: 5 })
  );

  await measure(
    "B) transaction pooler :6543 WITHOUT the flag",
    buildUrl(appUrl, { port: 6543, pgbouncer: false, limit: 5 })
  );

  await measure(
    "C) session pooler :5432 (fast, but capped at pool_size total clients)",
    buildUrl(appUrl, { port: 5432, pgbouncer: false, limit: 3 })
  );

  console.log(
    "Decision rule: the runtime mode must be fast AND survive concurrency.\n" +
      "A high error count under load is disqualifying regardless of latency."
  );
}

main().catch((e) => {
  console.error("probe failed:", e?.message || e);
  process.exitCode = 1;
});
