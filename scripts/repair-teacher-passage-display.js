const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);

let source = fs.readFileSync(target, "utf8");
const marker = "CRL_TEACHER_STORY_PASSAGE_DISPLAY_V1";

if (!source.includes(marker)) {
  const oldBlock = `  const passageText =\n    activeStage === "passage" && String(session?.current_content || "").trim()\n      ? String(session.current_content)\n      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;`;

  const newBlock = `  const livePassageContent = String(\n    session?.current_content ?? session?.currentContent ?? ""\n  ).trim();\n\n  const passageText =\n    activeStage === "passage" && livePassageContent\n      ? livePassageContent\n      : String(session?.story_title || session?.storyTitle || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;\n\n  /* ${marker} */`;

  if (!source.includes(oldBlock)) {
    throw new Error(
      "Teacher story passage display repair: expected passageText block was not found."
    );
  }

  source = source.replace(oldBlock, newBlock);
  fs.writeFileSync(target, source, "utf8");
}

console.log(
  "Applied CRL teacher story passage display repair: selected story content now renders immediately from either current_content or currentContent."
);
