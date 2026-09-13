const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);

let source = fs.readFileSync(file, "utf8");
const marker = "CRL_TEACHER_SELECTED_STORY_DISPLAY_V1";

if (!source.includes(marker)) {
  const oldPassageText = `  const passageText =\n    activeStage === "passage" && String(session?.current_content || "").trim()\n      ? String(session.current_content)\n      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;`;

  if (!source.includes(oldPassageText)) {
    throw new Error(
      "Teacher selected-story display repair: expected passage text resolver was not found."
    );
  }

  const newPassageText = `  const teacherStoryTitle = String(\n    session?.story_title ??\n      session?.storyTitle ??\n      ""\n  ).trim();\n\n  const teacherSelectedStory = STORIES.find(\n    (story) =>\n      String(story?.title || "").trim().toLowerCase() ===\n      teacherStoryTitle.toLowerCase()\n  );\n\n  const teacherLivePassageText = String(\n    session?.current_content ??\n      session?.currentContent ??\n      ""\n  ).trim();\n\n  const teacherPassagePlaceholder =\n    /choose\\s+a\\s+story\\s+passage|teacher\\s+will\\s+select\\s+it/i;\n\n  const resolvedTeacherPassageText =\n    teacherLivePassageText &&\n    !teacherPassagePlaceholder.test(teacherLivePassageText)\n      ? teacherLivePassageText\n      : String(teacherSelectedStory?.text || "").trim() ||\n        (teacherStoryTitle.toLowerCase() ===\n        "a day in the fields"\n          ? FIELD_PASSAGE_TEXT\n          : teacherStoryTitle.toLowerCase() ===\n              "para the parrot"\n            ? PASSAGE_TEXT\n            : "");\n\n  const passageText =\n    activeStage === "passage"\n      ? resolvedTeacherPassageText\n      : resolvedTeacherPassageText ||\n        (teacherStoryTitle.toLowerCase() ===\n        "a day in the fields"\n          ? FIELD_PASSAGE_TEXT\n          : PASSAGE_TEXT);\n\n  /* ${marker} */`;

  source = source.replace(oldPassageText, newPassageText);
  fs.writeFileSync(file, source, "utf8");
}

console.log(
  "Applied CRL teacher selected-story display repair: placeholder passage content is ignored and the selected story text renders immediately."
);
