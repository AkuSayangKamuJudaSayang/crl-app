/*
 * READ-ONLY REPRODUCTION HARNESS (creates one temporary session and removes it).
 *
 * Drives the real /api/assessment endpoints the way the teacher client does,
 * across the whole comprehension sequence, so a 500 can be traced to the exact
 * action and index instead of guessed at.
 *
 * Usage: node scripts/repro-comprehension.js [baseUrl]
 */

const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvLocal();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE = process.argv[2] || "http://127.0.0.1:3100";

async function call(token, action, body, method = "POST") {
  const url =
    method === "GET"
      ? `${BASE}/api/assessment?action=${encodeURIComponent(action)}&${new URLSearchParams(
          body || {}
        ).toString()}`
      : `${BASE}/api/assessment?action=${encodeURIComponent(action)}`;

  const started = Date.now();
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: method === "GET" ? undefined : JSON.stringify({ action, ...(body || {}) }),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 200);
  }

  return { status: response.status, ms: Date.now() - started, body: parsed };
}

async function main() {
  const teacher = await prisma.user.findFirst({
    where: { role: "teacher" },
    orderBy: { id: "asc" },
    select: { id: true, username: true, section: true },
  });

  if (!teacher) throw new Error("No teacher account found.");

  const learner = await prisma.learner.findFirst({
    where: { teacherId: teacher.id },
    orderBy: { id: "asc" },
    select: { id: true, lrn: true, firstName: true, lastName: true, section: true },
  });

  if (!learner) throw new Error("No learner found for the teacher.");

  console.log(
    `teacher=${teacher.username}(${teacher.id}) learner=${learner.lastName}, ${learner.firstName}(${learner.id})`
  );

  const token = jwt.sign(
    { id: teacher.id, username: teacher.username, role: "teacher" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const created = { hostIds: [], sessionIds: [] };

  try {
    /*
     * Create a disposable in-progress session directly. Going through
     * host_start would be refused for a learner whose BoSY is already completed,
     * and this harness must be able to replay any point of the flow.
     */
    await prisma.hostSession
      .deleteMany({ where: { code: "ZZTST1" } })
      .catch(() => null);
    await prisma.hostSession
      .deleteMany({ where: { code: "ZZTST2" } })
      .catch(() => null);

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
        code: "ZZTST1",
        teacherId: teacher.id,
        learnerId: learner.id,
        assessmentSessionId: assessment.id,
        stage: "story_choice",
        currentContent: "Choose a story passage. The teacher will select it.",
        storyTitle: null,
        linkedAt: new Date(),
      },
    });

    const code = host.code;
    created.hostIds.push(host.id);
    created.sessionIds.push(assessment.id);
    console.log(`disposable session code=${code} sessionId=${assessment.id}`);

    // Read the questions the same way both clients do.
    const content = await prisma.assessmentContent.findMany({
      where: { teacherId: teacher.id, assessmentPeriod: "BoSY", category: "stories" },
      orderBy: { position: "asc" },
    });
    console.log(
      `stories available: ${content.map((row) => row.storyTitle).join(", ") || "(none)"}`
    );

    // Move the host into the passage the same way the teacher client does.
    const selectStory = await call(token, "select_story", {
      code,
      story_id: content[0]?.id,
    });
    console.log(`\nselect_story -> ${selectStory.status} (${selectStory.ms}ms)`);

    const ready = await call(token, "passage_ready", {
      code,
      started_at: new Date().toISOString(),
    });
    console.log(`passage_ready -> ${ready.status} (${ready.ms}ms)`);

    console.log("\n=== COMPREHENSION SEQUENCE (teacher record + advance) ===");

    const questions = [
      "What must Para look for?",
      "What time or part of the day is it?",
      "What does Para land on?",
      "Who does Para see?",
      "What else is the police officer doing besides directing traffic?",
      "What could the police officer be feeling?",
    ];

    for (let index = 0; index < questions.length; index += 1) {
      const record = await call(token, "record_comprehension", {
        code,
        question_index: index,
        is_correct: index % 2 === 0,
        persist_only: true,
      });

      const nextIndex = index + 1;
      let advance = null;

      if (nextIndex < questions.length) {
        advance = await call(token, "host_update", {
          code,
          stage: "comprehension",
          currentContent: questions[nextIndex],
          storyTitle: content[0]?.storyTitle || "Para the Parrot",
          expected_stage: "comprehension",
          expected_current_content: questions[index],
          item_index: nextIndex,
        });
      } else {
        advance = await call(token, "host_advance", {
          code,
          stage: "learner_experience",
          currentContent: "LEARNER_EXPERIENCE",
          storyTitle: content[0]?.storyTitle || "",
          expected_stage: "comprehension",
          expected_current_content: questions[index],
        });
      }

      console.log(
        `Q${index + 1}: record_comprehension -> ${record.status} (${record.ms}ms)` +
          `  |  advance -> ${advance.status} (${advance.ms}ms)`
      );

      if (record.status >= 500) {
        console.log(`   !! record_comprehension FAILED: ${JSON.stringify(record.body)}`);
      }
      if (advance.status >= 500) {
        console.log(`   !! advance FAILED: ${JSON.stringify(advance.body)}`);
      }
    }

    console.log("\n=== LEARNER POSITION POLL ===");
    for (let i = 0; i < 3; i += 1) {
      const position = await call(
        token,
        "learner_position",
        { code },
        "GET"
      );
      console.log(
        `poll ${i + 1} -> ${position.status} (${position.ms}ms) stage=${position.body?.stage} content=${JSON.stringify(
          position.body?.current_content
        ).slice(0, 60)}`
      );
    }

    const experience = await call(token, "save_experience_rating", {
      code,
      learner_id: learner.id,
      experience_rating: 4,
      comprehension_results: questions.map((_, index) => ({
        questionIndex: index,
        isCorrect: index % 2 === 0,
      })),
      passage_miscues: [],
      timer_seconds: 30,
    });
    console.log(`\nsave_experience_rating -> ${experience.status} (${experience.ms}ms)`);
    if (experience.status >= 400) {
      console.log(JSON.stringify(experience.body).slice(0, 400));
    }
  } finally {
    // Remove everything this harness created.
    for (const sessionId of created.sessionIds.filter(Boolean)) {
      await prisma.assessmentSession
        .delete({ where: { id: Number(sessionId) } })
        .catch(() => null);
    }
    for (const hostId of created.hostIds.filter(Boolean)) {
      await prisma.hostSession
        .delete({ where: { id: Number(hostId) } })
        .catch(() => null);
    }
    console.log("\ncleanup: temporary session rows removed");
  }
}

main()
  .catch((error) => {
    console.error("Reproduction failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
