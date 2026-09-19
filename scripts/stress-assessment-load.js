/*
 * Stress the assessment API the way two real devices do: the teacher records
 * answers and advances while the learner polls position/status. This reproduces
 * the connection-pool pressure that surfaced as
 * "Internal assessment server error." (HTTP 500) mid-assessment.
 *
 * Creates one temporary session and removes it afterwards.
 */

const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

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
const prisma = new PrismaClient();

const BASE = process.argv[2] || "http://127.0.0.1:3100";
const CODE = "ZZTST2";

let token = "";

async function post(action, body) {
  const started = Date.now();
  const response = await fetch(
    `${BASE}/api/assessment?action=${encodeURIComponent(action)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...body }),
    }
  );
  const text = await response.text();
  return { action, status: response.status, ms: Date.now() - started, text };
}

async function get(action, params) {
  const started = Date.now();
  const response = await fetch(
    `${BASE}/api/assessment?action=${encodeURIComponent(action)}&${new URLSearchParams(params)}`,
    {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    }
  );
  const text = await response.text();
  return { action, status: response.status, ms: Date.now() - started, text };
}

async function main() {
  const teacher = await prisma.user.findFirst({
    where: { role: "teacher" },
    orderBy: { id: "asc" },
    select: { id: true, username: true },
  });
  const learner = await prisma.learner.findFirst({
    where: { teacherId: teacher.id },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  token = jwt.sign(
    { id: teacher.id, username: teacher.username, role: "teacher" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  await prisma.hostSession.deleteMany({ where: { code: CODE } }).catch(() => null);

  const assessment = await prisma.assessmentSession.create({
    data: {
      learnerId: learner.id,
      teacherId: teacher.id,
      assessmentPeriod: "BoSY",
      dateAdministered: new Date(),
      isCompleted: false,
    },
  });

  const host = await prisma.hostSession.create({
    data: {
      code: CODE,
      teacherId: teacher.id,
      learnerId: learner.id,
      assessmentSessionId: assessment.id,
      stage: "passage",
      currentContent: "What must Para look for?",
      storyTitle: "Para the Parrot",
      linkedAt: new Date(),
      passageStartedAt: new Date(),
    },
  });

  const questions = [
    "What must Para look for?",
    "What time or part of the day is it?",
    "What does Para land on?",
    "Who does Para see?",
    "What else is the police officer doing besides directing traffic?",
    "What could the police officer be feeling?",
  ];

  console.log("=== CONCURRENT LOAD (2 devices, simultaneous requests) ===");

  const results = [];

  for (let index = 0; index < questions.length; index += 1) {
    // Teacher records the answer and advances, while the learner polls hard and
    // the teacher's own reconciliation poll also runs - all at the same time.
    const burst = await Promise.all([
      post("record_comprehension", {
        code: CODE,
        question_index: index,
        is_correct: index % 2 === 0,
        persist_only: true,
      }),
      post("host_update", {
        code: CODE,
        stage: "comprehension",
        currentContent: questions[index],
        storyTitle: "Para the Parrot",
      }),
      get("learner_position", { code: CODE }),
      get("learner_position", { code: CODE }),
      get("learner_position", { code: CODE }),
      get("host_get", { code: CODE }),
      get("learner_status", { code: CODE }),
      post("record_passage_miscue", {
        code: CODE,
        word_index: index,
        miscue_type: "Omission",
        persist_only: true,
      }),
      post("remove_passage_miscue", { code: CODE, word_index: index, persist_only: true }),
      get("learner_position", { code: CODE }),
    ]);

    results.push(...burst);

    const worst = Math.max(...burst.map((r) => r.ms));
    const failures = burst.filter((r) => r.status >= 400);
    console.log(
      `Q${index + 1}: 10 concurrent requests, slowest=${worst}ms, failures=${failures.length}` +
        (failures.length
          ? ` -> ${failures.map((f) => `${f.action}:${f.status} ${f.text.slice(0, 80)}`).join(" | ")}`
          : "")
    );
  }

  const all = results;
  const fiveHundreds = all.filter((r) => r.status >= 500);
  const fourHundreds = all.filter((r) => r.status >= 400 && r.status < 500);
  const sorted = [...all].sort((a, b) => a.ms - b.ms);

  console.log("\n=== RESULT ===");
  console.log(`total requests: ${all.length}`);
  console.log(`HTTP 5xx: ${fiveHundreds.length}`);
  console.log(`HTTP 4xx: ${fourHundreds.length}`);
  console.log(
    `latency p50=${sorted[Math.floor(sorted.length / 2)].ms}ms` +
      ` p95=${sorted[Math.floor(sorted.length * 0.95)].ms}ms` +
      ` max=${sorted[sorted.length - 1].ms}ms`
  );

  if (fiveHundreds.length) {
    console.log("\n!! 5xx detail:");
    for (const failure of fiveHundreds.slice(0, 5)) {
      console.log(`   ${failure.action}: ${failure.text.slice(0, 160)}`);
    }
  }
  if (fourHundreds.length) {
    console.log("\n4xx detail (expected for some probes):");
    const grouped = new Map();
    for (const failure of fourHundreds) {
      const key = `${failure.action}:${failure.status}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    for (const [key, count] of grouped) console.log(`   ${key} x${count}`);
  }

  await prisma.passageMiscue.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.comprehensionResult.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.hostSession.delete({ where: { id: host.id } }).catch(() => null);
  await prisma.assessmentSession.delete({ where: { id: assessment.id } }).catch(() => null);
  console.log("\ncleanup: temporary session rows removed");
}

main()
  .catch((error) => {
    console.error("stress failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
