const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "app", "api", "assessment", "route.js");
const source = fs.readFileSync(target, "utf8");

const marker = "// CRL_ASSESSMENT_FLOW_FULL_SEQUENCE";
if (source.includes(marker)) {
  console.log("Assessment flow fix already applied.");
  process.exit(0);
}

let patched = source;

const task1EarlyStop = `        const task1Zero =\n          Number(scoring?.task1Score ?? 0) === 0 &&\n          Number(scoring?.task2Score ?? 0) === 0;`;
if (!patched.includes(task1EarlyStop)) {
  throw new Error("Expected Task 1 early-stop guard was not found; refusing to patch an unexpected route version.");
}
patched = patched.replace(task1EarlyStop, "        const task1Zero = false;");

patched = patched.replaceAll(
  `      hardTerminate:\n        true,\n      hardTerminateStage:\n        "letter",`,
  `      hardTerminate:\n        false,\n      hardTerminateStage:\n        null,`
);
patched = patched.replaceAll(
  `      hardTerminate:\n        true,\n      hardTerminateStage:\n        "word",`,
  `      hardTerminate:\n        false,\n      hardTerminateStage:\n        null,`
);

const classificationGuard = `\n  if (\n    part1.hardTerminate\n  ) {\n    return part1.profile;\n  }\n`;
if (!patched.includes(classificationGuard)) {
  throw new Error("Expected classification hard-termination guard was not found.");
}
patched = patched.replace(classificationGuard, "\n");

const metricsStart = patched.indexOf("  const isPart1Task1EarlyStop =");
const passageStart = patched.indexOf("  const passageStarted =", metricsStart);
const passageEnd = patched.indexOf("\n  );", passageStart);
if (metricsStart < 0 || passageStart < 0 || passageEnd < 0) {
  throw new Error("Expected early-stop metrics block was not found.");
}

const metricsReplacement = `  const timerSeconds =\n    existingSessionMetrics?.timerSeconds ??\n    null;\n\n  const wordsRead = Math.max(\n    0,\n    passageWordCount -\n      totalMiscues\n  );\n\n  const miscueAccuracy = Number(\n    wordsRead.toFixed(2)\n  );\n\n  const passageStarted =\n    miscues.length > 0 ||\n    comprehension.length > 0 ||\n    timerSeconds !== null;`;

patched =
  patched.slice(0, metricsStart) +
  metricsReplacement +
  patched.slice(passageEnd + 5);

const hardcodedPassageStart = `                      currentContent:\n                        'What must Para look for?',\n                      storyTitle:\n                        "Para the Parrot",`;
if (!patched.includes(hardcodedPassageStart)) {
  throw new Error("Expected hardcoded comprehension handoff was not found.");
}
patched = patched.replace(
  hardcodedPassageStart,
  `                      currentContent:\n                        String(host.storyTitle || "")\n                          .trim()\n                          .toLowerCase()\n                          .includes("a day in the fields")\n                          ? "What is the job of Dulnuwan?"\n                          : "What must Para look for?",\n                      storyTitle:\n                        host.storyTitle || "Para the Parrot",`
);

const tag = `\n${marker}\n`;
patched = patched.replace("\nexport async function GET(", `${tag}\nexport async function GET(`);

if (patched === source) {
  throw new Error("Assessment flow patch produced no change.");
}

fs.writeFileSync(target, patched, "utf8");
console.log("Applied CRL assessment flow: Letter Sounds -> Word Recognition -> Story Choice -> Passage -> Comprehension -> Learner Experience -> Final Results.");
