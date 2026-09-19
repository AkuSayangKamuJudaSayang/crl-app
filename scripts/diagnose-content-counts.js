/*
 * READ-ONLY diagnostic: how much assessment content exists per teacher/period.
 *
 * record_word and record_letter validate the submitted item index against the
 * teacher's live assessment content, so a short word list would reject every
 * item past its length while the first few keep working.
 */

const fs = require("node:fs");
const path = require("node:path");

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

async function main() {
  const rows = await prisma.assessmentContent.findMany({
    orderBy: [
      { teacherId: "asc" },
      { assessmentPeriod: "asc" },
      { category: "asc" },
      { position: "asc" },
    ],
    include: {
      teacher: { select: { id: true, username: true, section: true } },
    },
  });

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.teacherId}|${row.assessmentPeriod}|${row.category}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        teacher: row.teacher?.username || row.teacherId,
        section: row.teacher?.section || "",
        period: row.assessmentPeriod,
        category: row.category,
        items: [],
      });
    }
    grouped.get(key).items.push(
      row.category === "stories"
        ? `${row.storyTitle || "(untitled)"} [${String(row.content || "").length} chars]`
        : String(row.content || "")
    );
  }

  const teachers = await prisma.user.findMany({
    select: { id: true, username: true, section: true, role: true },
    orderBy: { id: "asc" },
  });

  console.log("=== TEACHERS ===");
  for (const t of teachers) {
    console.log(
      `id=${t.id} ${t.username} role=${t.role} section=${t.section || "(none)"}`
    );
  }

  console.log("\n=== ASSESSMENT CONTENT ===");
  const problems = [];

  for (const group of grouped.values()) {
    console.log(
      `\nteacher=${group.teacher} (${group.section || "no section"}) period=${group.period} category=${group.category} count=${group.items.length}`
    );
    group.items.forEach((item, index) => {
      console.log(`   ${index}: ${item}`);
    });

    if (group.category === "words" && group.items.length !== 10) {
      problems.push(
        `words for ${group.teacher}/${group.period} = ${group.items.length} (expected 10)`
      );
    }
    if (group.category === "letters" && group.items.length !== 10) {
      problems.push(
        `letters for ${group.teacher}/${group.period} = ${group.items.length} (expected 10)`
      );
    }
  }

  console.log("\n=== TEACHERS WITH NO CONTENT ROWS ===");
  const withContent = new Set(rows.map((row) => row.teacherId));
  for (const t of teachers) {
    if (!withContent.has(t.id)) {
      console.log(
        `id=${t.id} ${t.username} has NO assessment_content; get_activities seeds defaults on first use`
      );
    }
  }

  console.log("\n=== CONTENT LENGTH PROBLEMS ===");
  if (!problems.length) {
    console.log("none");
  } else {
    for (const problem of problems) console.log(`!! ${problem}`);
  }
}

main()
  .catch((error) => {
    console.error("Diagnostic failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
