/*
 * Reproduce the host_get 500.
 *
 * Creates one temporary session in a given state and calls host_get the way the
 * teacher client polls it, so the server's own error log identifies the throw.
 *
 * Usage: node scripts/repro-host-get.js [baseUrl] [scenario]
 *   scenario: letters | after-letters | passage | completed
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
const SCENARIO = process.argv[3] || "after-letters";
const CODE = "ZZHG01";

const LETTERS = ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"];
const WORDS = ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"];

let token = "";

async function hostGet(code, lean = false) {
  const started = Date.now();
  const response = await fetch(
    `${BASE}/api/assessment?action=host_get&code=${encodeURIComponent(code)}${lean ? "&lean=1" : ""}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }
  );
  const text = await response.text();
  return { status: response.status, ms: Date.now() - started, text };
}

async function main() {
  const teacher = await prisma.user.findFirst({
    where: { role: "teacher" },
    orderBy: { id: "asc" },
    select: { id: true, username: true, section: true },
  });
  const learner = await prisma.learner.findFirst({
    where: { teacherId: teacher.id },
    orderBy: { id: "desc" },
    select: { id: true, section: true },
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
      isCompleted: SCENARIO === "completed",
    },
  });

  const stageByScenario = {
    letters: "letter",
    "after-letters": "word",
    passage: "passage",
    completed: "completed",
  };

  const host = await prisma.hostSession.create({
    data: {
      code: CODE,
      teacherId: teacher.id,
      learnerId: learner.id,
      assessmentSessionId: assessment.id,
      stage: stageByScenario[SCENARIO] || "letter",
      currentContent: SCENARIO === "passage" ? "Para flies away from the houses" : WORDS[0],
      storyTitle: SCENARIO === "passage" ? "Para the Parrot" : null,
      linkedAt: new Date(),
      passageStartedAt: SCENARIO === "passage" ? new Date(Date.now() - 30000) : null,
    },
  });

  // Populate results.
  const letterCount = SCENARIO === "letters" ? 3 : 10;
  for (let i = 0; i < letterCount; i += 1) {
    await prisma.letterTaskResult.create({
      data: { sessionId: assessment.id, letterIndex: i, letter: LETTERS[i], isCorrect: i % 3 !== 0 },
    });
  }

  if (SCENARIO !== "letters") {
    for (let i = 0; i < 10; i += 1) {
      await prisma.wordTaskResult.create({
        data: { sessionId: assessment.id, wordIndex: i, word: WORDS[i], isCorrect: i % 2 === 0 },
      });
    }
  }

  if (SCENARIO === "passage" || SCENARIO === "completed") {
    await prisma.passageMiscue.create({
      data: { sessionId: assessment.id, wordIndex: 2, miscueType: "Omission", misreadWord: null },
    });
    await prisma.comprehensionResult.createMany({
      data: [
        { sessionId: assessment.id, questionIndex: 0, isCorrect: true },
        { sessionId: assessment.id, questionIndex: 1, isCorrect: false },
      ],
    });
  }

  // This is the state the teacher reaches after the final letter: a metrics row.
  if (SCENARIO !== "letters") {
    await prisma.sessionMetrics.create({
      data: {
        sessionId: assessment.id,
        task1Score: 7,
        task2Score: 5,
        totalMiscues: SCENARIO === "passage" || SCENARIO === "completed" ? 1 : 0,
        // Decimal column: this is what a naive JSON response cannot serialize.
        miscueAccuracy: "99.00",
        comprehensionScore: SCENARIO === "passage" || SCENARIO === "completed" ? 1 : 0,
        timerSeconds: SCENARIO === "passage" || SCENARIO === "completed" ? 30 : null,
        classificationLabel: "Transitioning Reader",
        experienceRating: SCENARIO === "completed" ? 4 : null,
        observationLevel: SCENARIO === "completed" ? 3 : null,
        remarks: SCENARIO === "completed" ? "test" : null,
      },
    });
  }

  console.log(`scenario=${SCENARIO} code=${CODE} stage=${stageByScenario[SCENARIO]}`);

  const fullSamples = [];
  const leanSamples = [];
  for (let i = 0; i < 5; i += 1) {
    fullSamples.push((await hostGet(CODE, false)).ms);
    leanSamples.push((await hostGet(CODE, true)).ms);
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(`  full host_get  median: ${median(fullSamples)}ms`);
  console.log(`  lean host_get  median: ${median(leanSamples)}ms`);

  const results = [];
  for (let i = 0; i < 4; i += 1) {
    const result = await hostGet(CODE, true);
    results.push(result);
    console.log(`  host_get #${i + 1} -> ${result.status} (${result.ms}ms) ${result.text.slice(0, 90)}`);
  }

  // And under a small concurrent burst, like two devices polling.
  const burst = await Promise.all(Array.from({ length: 6 }, () => hostGet(CODE)));
  const statuses = burst.map((r) => r.status);
  console.log(`  concurrent burst statuses: ${statuses.join(",")}`);

  const failures = [...results, ...burst].filter((r) => r.status >= 500);
  console.log(`\n5xx count: ${failures.length}`);

  await prisma.sessionMetrics.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.comprehensionResult.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.passageMiscue.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.letterTaskResult.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.wordTaskResult.deleteMany({ where: { sessionId: assessment.id } }).catch(() => null);
  await prisma.hostSession.delete({ where: { id: host.id } }).catch(() => null);
  await prisma.assessmentSession.delete({ where: { id: assessment.id } }).catch(() => null);
  console.log("cleanup: temporary session rows removed");
}

main()
  .catch((error) => {
    console.error("repro failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
