const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "app",
  "learner",
  "LearnerAssessmentPage.jsx"
);

const source = fs.readFileSync(target, "utf8");

const broken = `  const priorActive =\n    Boolean(prior?.learner_id) &&\n    !WAITING_STAGES.has(priorStage);`;

const fixed = `  const priorStage = String(prior.stage || "waiting");\n\n  const priorActive =\n    Boolean(prior?.learner_id) &&\n    !WAITING_STAGES.has(priorStage);`;

if (source.includes(fixed)) {
  console.log("Learner session merge guard is already fixed.");
  process.exit(0);
}

if (!source.includes(broken)) {
  throw new Error(
    "Expected learner session merge block was not found. Refusing to patch an unexpected source version."
  );
}

const patched = source.replace(broken, fixed);

if (patched === source) {
  throw new Error("Learner session merge patch produced no change.");
}

fs.writeFileSync(target, patched, "utf8");
console.log("Patched LearnerAssessmentPage.jsx: restored priorStage in mergeLearnerSession().");
