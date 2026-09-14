const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);
const source = fs.readFileSync(target, "utf8");
const routeSource = fs.readFileSync(
  path.join(process.cwd(), "app", "api", "assessment", "route.js"),
  "utf8"
);
const learnerSource = fs.readFileSync(
  path.join(process.cwd(), "app", "learner", "LearnerAssessmentPage.jsx"),
  "utf8"
);

function requirePattern(pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(`Assessment invariant failed: ${message}`);
  }
}

function rejectPattern(pattern, message) {
  if (pattern.test(source)) {
    throw new Error(`Assessment invariant failed: ${message}`);
  }
}

function requireCount(text, expected, message) {
  const count = source.split(text).length - 1;
  if (count !== expected) {
    throw new Error(
      `Assessment invariant failed: ${message}; expected ${expected}, found ${count}`
    );
  }
}

function requireRoutePattern(pattern, message) {
  if (!pattern.test(routeSource)) {
    throw new Error(`Assessment route invariant failed: ${message}`);
  }
}

function requireRouteCount(text, expected, message) {
  const count = routeSource.split(text).length - 1;
  if (count !== expected) {
    throw new Error(
      `Assessment route invariant failed: ${message}; expected ${expected}, found ${count}`
    );
  }
}

function requireLearnerPattern(pattern, message) {
  if (!pattern.test(learnerSource)) {
    throw new Error(`Learner invariant failed: ${message}`);
  }
}

function rejectLearnerPattern(pattern, message) {
  if (pattern.test(learnerSource)) {
    throw new Error(`Learner invariant failed: ${message}`);
  }
}

function sourceBlock(sourceText, start, end) {
  const startIndex = sourceText.indexOf(start);
  const endIndex = sourceText.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Unable to inspect source block: ${start} -> ${end}`);
  }
  return sourceText.slice(startIndex, endIndex);
}

requirePattern(
  /nextType\s*===\s*["']Substitution["']\s*&&\s*!nextMisreadWord/,
  "only substitution may require a learner-supplied word"
);

requireRouteCount(
  "const existingSessionMetrics =",
  1,
  "session metrics must be loaded before their timer value is read"
);
requireRouteCount(
  "const passageWordCount =",
  1,
  "passage word count must be declared before scoring"
);
requireRoutePattern(
  /const metrics\s*=\s*await tx\.sessionMetrics\.upsert\([\s\S]{0,1600}?return\s*\{[\s\S]{0,300}?metrics,/,
  "calculated metrics must still be persisted and returned"
);
const letterRouteBlock = sourceBlock(
  routeSource,
  'action ===\n      "record_letter"',
  "/* RECORD WORD"
);
const wordRouteBlock = sourceBlock(
  routeSource,
  'action ===\n      "record_word"',
  "/* SELECT STORY"
);
for (const [label, block] of [
  ["letter", letterRouteBlock],
  ["word", wordRouteBlock],
]) {
  const guardIndex = block.indexOf("!host ||");
  const contentIndex = block.indexOf("getLiveAssessmentContent(");
  if (guardIndex < 0 || contentIndex < 0 || guardIndex > contentIndex) {
    throw new Error(
      `Assessment route invariant failed: ${label} host must be validated before teacherId is read`
    );
  }
}
if (letterRouteBlock.includes("safeCalculateMetrics(")) {
  throw new Error(
    "Assessment route invariant failed: Letter-to-Word transition must not block on final metrics"
  );
}
requireRoutePattern(
  /if\s*\(action\s*===\s*["']save_experience_rating["']\)[\s\S]{0,900}?requireTeacher\(request\)[\s\S]{0,900}?teacherId:\s*ratingAuth\.userId/,
  "only the authenticated teacher may save the learner experience rating"
);
requireRoutePattern(
  /host\.stage\s*===\s*["']comprehension["'][\s\S]{0,500}?comprehensionResult\.count[\s\S]{0,300}?recordedAnswers\s*>=\s*QUESTIONS\.length/,
  "the learner experience rating must tolerate the final-comprehension transition race"
);

requireLearnerPattern(
  /stage\s*===\s*["']learner_experience["'][\s\S]{0,1500}?EXPERIENCE_RATING_CHOICES/,
  "the learner experience scale must render whenever its stage is active"
);
requireLearnerPattern(
  /Point to or tell your teacher[\s\S]{0,900}?pointerEvents:\s*["']none["']/,
  "the learner scale must be presentation-only"
);
rejectLearnerPattern(
  /submitExperienceRating/,
  "the learner app must not submit the teacher-recorded experience rating"
);
rejectLearnerPattern(
  /action=passage_ready/,
  "the learner app must never start the passage timer"
);
requireLearnerPattern(
  /stage\s*===\s*["']passage["']\s*&&\s*passageHasStarted/,
  "the learner must wait for the teacher-started passage timer before rendering the passage"
);
requireRoutePattern(
  /if\s*\(action\s*===\s*["']passage_ready["']\)[\s\S]{0,500}?requireTeacher\(request\)[\s\S]{0,700}?teacherId:\s*timerAuth\.userId/,
  "only the authenticated teacher may start the passage timer"
);
requirePattern(
  /const startPassageTimer\s*=\s*useCallback\([\s\S]{0,1800}?action:\s*["']passage_ready["']/,
  "the teacher must explicitly start the passage timer"
);
requirePattern(
  /Part 1 Task 1 — Letter Sounds/,
  "the final review must show the Task 1 Letter Sounds record"
);
requirePattern(
  /Part 1 Task 2 — Word Recognition/,
  "the final review must show the Task 2 Word Recognition record"
);
requirePattern(
  /Part 1 Total[\s\S]{0,180}?\/ 20/,
  "the final review must show the Grade 3 Part 1 total"
);
requirePattern(
  /View exact miscued words[\s\S]{0,1200}?Position \{Number\(item\.wordIndex\) \+ 1\}/,
  "the final review must disclose each exact miscue on demand"
);
rejectPattern(
  /<select value=\{finalReadingProfile\}/,
  "the teacher must not be able to edit the computed reading profile"
);
requireRoutePattern(
  /const readingProfile = calculateClassification\([\s\S]{0,1000}?classificationLabel: readingProfile/,
  "the server must compute and persist the scoresheet reading profile"
);
requirePattern(
  /activeStage\s*===\s*["']learner_experience["'][\s\S]{0,2600}?saveLearnerExperienceRating\(rating\)/,
  "the teacher must receive the interactive five-point scale"
);
requirePattern(
  /const optimisticWordSession\s*=\s*\{[\s\S]{0,900}?publishAssessmentState\([\s\S]{0,500}?persistAnswerWithRetry\(\s*["']record_letter["']/,
  "Word 1 must publish before the final Letter save finishes"
);
requirePattern(
  /const nextComprehension\s*=\s*\[[\s\S]{0,1700}?publishAssessmentState\([\s\S]{0,300}?publishAssessmentRealtimeState\(code, nextSession\)/,
  "the next comprehension question must publish optimistically"
);
requirePattern(
  /if\s*\(\s*label\s*===\s*["']Insertion["']\s*\)\s*\{[\s\S]{0,500}?setSubstitutionInputRequested\s*\(\s*false\s*\)[\s\S]{0,500}?recordPassageMiscue\s*\([\s\S]{0,100}?["']Insertion["']\s*,\s*["']["']\s*\)\s*;?[\s\S]{0,80}?return\s*;/,
  "insertion must clear substitution state, close immediately, apply, and return"
);
requirePattern(
  /\{\s*substitutionInputRequested\s*&&\s*selectedMiscueType\s*===\s*["']Substitution["']\s*&&\s*\(/,
  "the learner-word input must require an explicit substitution request"
);
requirePattern(
  /if\s*\(\s*label\s*===\s*["']Substitution["']\s*\)\s*\{\s*setSubstitutionInputRequested\s*\(\s*true\s*\)\s*;?\s*return\s*;/,
  "only the substitution button may request learner-word input"
);
rejectPattern(
  /selectedMiscueType\s*===\s*["']Insertion["']\s*\|\|\s*selectedMiscueType\s*===\s*["']Substitution["']/,
  "insertion must never share the substitution input condition"
);
rejectPattern(
  /\{\s*selectedMiscueType\s*===\s*["']Substitution["']\s*&&\s*\(/,
  "stale selected type alone must never expose the learner-word input"
);
requirePattern(
  /label\s*===\s*["']Reversion["'][\s\S]{0,220}?passageMiscues\.some\([\s\S]{0,180}?selectedPassageWord/,
  "reversion must be disabled for an already-miscued source word"
);
requirePattern(
  /collidesWithExistingMiscue[\s\S]{0,260}?if\s*\(\s*collidesWithExistingMiscue\s*\)\s*return\s*;/,
  "a reversion pair must reject either already-miscued word"
);

requireCount(
  "const [showWordSavingOverlay, setShowWordSavingOverlay] = useState(false);",
  1,
  "the Word saving overlay state must be declared exactly once"
);
requireCount(
  "setShowWordSavingOverlay(true);",
  1,
  "the Word saving overlay must have exactly one activation"
);
requirePattern(
  /const isFinal\s*=\s*currentIndex\s*===\s*WORDS\.length\s*-\s*1\s*;\s*if\s*\(\s*isFinal\s*\)\s*\{\s*setShowWordSavingOverlay\(true\);\s*\}/,
  "the Word saving overlay must activate only after the final-word check"
);

console.log(
  "Verified assessment invariants: insertion applies immediately, only substitution requests learner input, reversion rejects existing miscues, and the final-word overlay is singular."
);
