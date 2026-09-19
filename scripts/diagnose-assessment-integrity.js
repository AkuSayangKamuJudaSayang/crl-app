/*
 * READ-ONLY diagnostic.
 *
 * Compares each completed assessment session's stored metrics against the
 * actual result rows so we can tell whether comprehension answers are missing
 * from the database (a write problem) or present but reported as zero (a
 * display/metrics problem).
 *
 * Usage: node scripts/diagnose-assessment-integrity.js [limit]
 */

const fs = require("node:fs");
const path = require("node:path");

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;

  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function summarizeResults(rows, indexKey) {
  const byIndex = new Map();
  for (const row of rows) byIndex.set(Number(row[indexKey]), Boolean(row.isCorrect));
  return byIndex;
}

async function main() {
  const limit = Number(process.argv[2] || 25);

  const sessions = await prisma.assessmentSession.findMany({
    orderBy: { id: "desc" },
    take: limit,
    include: {
      sessionMetrics: true,
      letterResults: true,
      wordResults: true,
      passageMiscues: true,
      comprehensionResults: true,
      hostSessions: true,
    },
  });

  console.log(`Inspecting ${sessions.length} most recent assessment sessions.\n`);

  const suspects = [];

  for (const session of sessions) {
    const letters = summarizeResults(session.letterResults, "letterIndex");
    const words = summarizeResults(session.wordResults, "wordIndex");
    const comp = summarizeResults(session.comprehensionResults, "questionIndex");

    const letterCorrect = [...letters.values()].filter(Boolean).length;
    const wordCorrect = [...words.values()].filter(Boolean).length;
    const compRows = comp.size;
    const compCorrect = [...comp.values()].filter(Boolean).length;

    const metrics = session.sessionMetrics;
    const storedComp = metrics ? Number(metrics.comprehensionScore || 0) : null;
    const storedTask1 = metrics ? Number(metrics.task1Score || 0) : null;
    const storedTask2 = metrics ? Number(metrics.task2Score || 0) : null;

    const part1Total = letterCorrect + wordCorrect;
    const passageExpected = part1Total > 10;

    const problems = [];
    if (storedComp !== null && storedComp !== compCorrect) {
      problems.push(`metrics.comprehensionScore=${storedComp} but rows say ${compCorrect}`);
    }
    if (storedTask1 !== null && storedTask1 !== letterCorrect) {
      problems.push(`metrics.task1Score=${storedTask1} but rows say ${letterCorrect}`);
    }
    if (storedTask2 !== null && storedTask2 !== wordCorrect) {
      problems.push(`metrics.task2Score=${storedTask2} but rows say ${wordCorrect}`);
    }
    if (passageExpected && compRows === 0 && (session.passageMiscues.length > 0 || metrics?.timerSeconds != null)) {
      problems.push("passage was administered and timed, but ZERO comprehension rows exist");
    }
    if (passageExpected && compRows > 0 && compRows < 6) {
      problems.push(`only ${compRows}/6 comprehension rows persisted`);
    }
    if (passageExpected && compRows === 6 && compCorrect > 0 && storedComp === 0) {
      problems.push("6 comprehension rows persisted with correct answers, but stored score is 0");
    }

    const code = session.hostSessions?.[0]?.code || "-";

    console.log(
      [
        `session=${session.id}`,
        `period=${session.assessmentPeriod}`,
        `code=${code}`,
        `completed=${session.isCompleted}`,
        `T1=${letterCorrect}(${letters.size} rows)`,
        `T2=${wordCorrect}(${words.size} rows)`,
        `comp=${compCorrect}/${compRows} rows`,
        `storedComp=${storedComp}`,
        `timer=${metrics?.timerSeconds ?? "null"}`,
        `miscues=${session.passageMiscues.length}`,
      ].join("  ")
    );

    if (problems.length) {
      suspects.push({ id: session.id, code, problems });
      for (const problem of problems) console.log(`    !! ${problem}`);
    }
  }

  console.log("\n================ SUMMARY ================");
  console.log(`Sessions inspected: ${sessions.length}`);
  console.log(`Sessions with integrity problems: ${suspects.length}`);

  const compMissing = suspects.filter((s) =>
    s.problems.some((p) => p.includes("ZERO comprehension rows"))
  ).length;
  const compPartial = suspects.filter((s) =>
    s.problems.some((p) => p.includes("comprehension rows persisted"))
  ).length;

  console.log(`  - passage administered but no comprehension rows: ${compMissing}`);
  console.log(`  - partial comprehension rows (<6): ${compPartial}`);

  if (suspects.length) {
    console.log("\nSuspect session ids:");
    console.log(suspects.map((s) => `${s.id}${s.code ? `(${s.code})` : ""}`).join(", "));
  }
}

main()
  .catch((error) => {
    console.error("Diagnostic failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
