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
const teacherPageSource = fs.readFileSync(
  path.join(process.cwd(), "app", "teacher", "page.jsx"),
  "utf8"
);
const excelReportSource = fs.readFileSync(
  path.join(process.cwd(), "app", "api", "reports", "excel", "route.js"),
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

function requireTeacherPagePattern(pattern, message) {
  if (!pattern.test(teacherPageSource)) {
    throw new Error(`Teacher records invariant failed: ${message}`);
  }
}

function requireExcelReportPattern(pattern, message) {
  if (!pattern.test(excelReportSource)) {
    throw new Error(`Excel report invariant failed: ${message}`);
  }
}

function requireLearnerCount(text, expected, message) {
  const count = learnerSource.split(text).length - 1;
  if (count !== expected) {
    throw new Error(
      `Learner invariant failed: ${message}; expected ${expected}, found ${count}`
    );
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

function rejectForwardHookDependency(hookName, declaration) {
  const declarationIndex = source.indexOf(declaration);
  if (declarationIndex < 0) {
    throw new Error(`Assessment invariant failed: ${hookName} must be declared`);
  }
  const beforeDeclaration = source.slice(0, declarationIndex);
  const dependencyPattern = new RegExp(
    `^\\s*${hookName},\\s*$`,
    "m"
  );
  if (dependencyPattern.test(beforeDeclaration)) {
    throw new Error(
      `Assessment invariant failed: ${hookName} cannot appear in a callback dependency list before it is initialized`
    );
  }
}

rejectForwardHookDependency(
  "flushAnswerQueue",
  "const flushAnswerQueue = useCallback"
);
rejectForwardHookDependency(
  "queueAnswerForBackgroundSave",
  "const queueAnswerForBackgroundSave = useCallback"
);

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
if (
  !letterRouteBlock.includes("safeCalculateMetrics(") ||
  !letterRouteBlock.includes("scoring.hardTerminate") ||
  !letterRouteBlock.includes("completeEarlyTermination(")
) {
  throw new Error(
    "Assessment route invariant failed: a zero-score Letter Sounds task must terminate before Word Recognition"
  );
}
if (
  !wordRouteBlock.includes("task1SnapshotScore + task2SnapshotScore <= 10") ||
  !wordRouteBlock.includes("completeEarlyTermination(")
) {
  throw new Error(
    "Assessment route invariant failed: a Part 1 total of 10 or less must stop before Story Selection"
  );
}
requirePattern(
  /function isTeacherStageRegression/,
  "teacher stage ordering must be defined"
);
requirePattern(
  /isTeacherStageRegression\(data\.session\?\.stage, liveTeacherSession\.stage\)/,
  "older server stages must not replace newer optimistic teacher stages"
);
requirePattern(
  /task2_results:\s*answerSession\.task2Results/,
  "the final Word Recognition save must include the complete recorded snapshot"
);
requireRoutePattern(
  /hasSubmittedTask1Snapshot[\s\S]{0,5000}?letterTaskResult\.createMany\([\s\S]{0,500}?submittedTask1ByIndex\.get\(index\)/,
  "final review must reconcile the complete Letter Sounds snapshot"
);
requirePattern(
  /action:\s*["']finish_passage["'][\s\S]{0,300}?passage_miscues:\s*passageMiscues/,
  "finishing Passage Reading must persist the exact miscue snapshot"
);
requirePattern(
  /queueAnswerForBackgroundSave\(["']record_passage_miscue["'][\s\S]{0,250}?miscue_type:/,
  "passage miscues must save to the cloud in the background"
);
requirePattern(
  /queueAnswerForBackgroundSave\(["']record_comprehension["'][\s\S]{0,250}?question_index:\s*currentIndex/,
  "each comprehension response must save in the background"
);
requirePattern(
  /experience_rating:\s*rating[\s\S]{0,500}?comprehension_results:[\s\S]{0,300}?passage_miscues:[\s\S]{0,300}?timer_seconds:/,
  "the learner experience boundary must reconcile passage and comprehension results"
);
const experienceRouteBlock = sourceBlock(
  routeSource,
  'if (action === "save_experience_rating")',
  "/* TEACHER AUTHENTICATION"
);
if (
  !experienceRouteBlock.includes("replaceComprehensionResults(") ||
  !experienceRouteBlock.includes("replacePassageMiscues(") ||
  !experienceRouteBlock.includes("calculateMetrics(")
) {
  throw new Error(
    "Assessment route invariant failed: cloud metrics must be calculated from the complete local assessment snapshot"
  );
}
if (
  !experienceRouteBlock.includes("requireTeacher(request)") ||
  !experienceRouteBlock.includes("teacherId: ratingAuth.userId")
) {
  throw new Error(
    "Assessment route invariant failed: only the authenticated teacher may save the learner experience rating"
  );
}
if (
  !experienceRouteBlock.includes('["passage", "comprehension"].includes(host.stage)') ||
  !experienceRouteBlock.includes("comprehensionResult.count(") ||
  !experienceRouteBlock.includes("recordedAnswers >= COMPREHENSION_QUESTION_COUNT")
) {
  throw new Error(
    "Assessment route invariant failed: the learner experience rating must tolerate the final-comprehension transition race"
  );
}

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
  /if\s*\(data\.scoring\?\.hardTerminate\)[\s\S]{0,1200}?stage:\s*["']terminated["']/,
  "a zero-score Letter Sounds result must stay terminated"
);
requirePattern(
  /if\s*\(data\.scoring\?\.hardTerminate\)[\s\S]{0,1800}?openAssessmentSaveModal\(terminalSession\)/,
  "a zero-score Letter Sounds result must open remarks review"
);
requirePattern(
  /const isZeroScoreTask1\s*=\s*\n?\s*answerSession\.task1Results/,
  "the teacher must detect a complete zero-score Letter Sounds result"
);
requirePattern(
  /isZeroScoreTask1[\s\S]{0,900}?stage:\s*["']terminated["']/,
  "a zero-score Letter Sounds task must bypass Word Recognition"
);
requirePattern(
  /persistAnswerWithRetry\(\s*["']record_letter["']/,
  "the final Letter Sounds result must still be persisted"
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

rejectPattern(
  /showWordSavingOverlay|Saving the final Word Recognition result/,
  "Word Recognition must transition to Story Selection without a blocking overlay"
);

requirePattern(
  /await finalLetterSavePromiseRef\.current;[\s\S]{0,180}?await finalWordSavePromiseRef\.current;[\s\S]{0,900}?save_final_assessment_review/,
  "the first final-review Save must wait for every Part 1 boundary write"
);
requirePattern(
  /const requestedIndex = wordIndex;[\s\S]{0,700}?await finalLetterSavePromiseRef\.current;[\s\S]{0,1000}?const isFinal = currentIndex === WORDS\.length - 1/,
  "the first Word Recognition click must lock immediately while the Letter Sounds boundary save settles"
);
requirePattern(
  /const releaseFirstWordControls = useCallback\([\s\S]{0,700}?finalLetterSavePromiseRef\.current\.finally/,
  "the Word Recognition gate must not release before the final Letter Sounds save settles"
);
requireLearnerPattern(
  /const isPart1Stop =[\s\S]{0,180}?stage \|\| ""\) === "terminated"[\s\S]{0,300}?Boolean\(incoming\.ended\) \|\| isPart1Stop/,
  "a Part 1 low-score termination must redirect the learner even before the final review is saved"
);
requireLearnerPattern(
  /\(!session\.ended && session\.stage !== "terminated"\)/,
  "the learner terminal redirect effect must cover an open terminated session"
);

requirePattern(
  /const finalReviewSaveInFlightRef =[\s\S]{0,80}?useRef\(false\)/,
  "the final review must use a synchronous one-click save guard"
);
requirePattern(
  /if \(finalReviewSaveInFlightRef\.current\) return;[\s\S]{0,180}?setSavingTerminationObservation\(true\)/,
  "the final-review button must acknowledge its first press immediately"
);
requirePattern(
  /session\?\.stage === "terminated"[\s\S]{0,120}?session\?\.current_content === "ZERO_SCORE_PART1_TASK1"[\s\S]{0,220}?busy/,
  "the zero-score save button must not inherit the final-answer busy restraint"
);
requireLearnerPattern(
  /Freeze terminal updates while the zero-score encouragement[\s\S]{0,400}?zeroScoreRedirectingRef\.current = true/,
  "the zero-score learner toolbar must remain visible until code-entry reset"
);
requireLearnerPattern(
  /function LearnerToolbar[\s\S]{0,7000}?z-index:\s*5100[\s\S]{0,7000}?z-index:\s*6000/,
  "connection and exit dialogs must cover and dim the persistent learner toolbar"
);
requireLearnerCount(
  "<LearnerToolbar",
  2,
  "the learner toolbar must render once in each learner shell"
);
requireLearnerPattern(
  /<LearnerDialogs[\s\S]{0,500}?showConnectionSettings=\{showConnectionSettings\}[\s\S]{0,200}?showExitConfirm=\{showExitConfirm\}/,
  "active learner screens must render connection and exit dialogs"
);
rejectLearnerPattern(
  /assessment-active-toolbar/,
  "assessment state must never hide the learner utility buttons"
);
requireRoutePattern(
  /function getRecordedPassageMetrics[\s\S]{0,900}?totalPart1Score > 10[\s\S]{0,220}?timerSeconds !== null[\s\S]{0,500}?wordsRead: 0/,
  "records must report zero words when Passage Reading was not administered"
);
requireRoutePattern(
  /const passageStarted =[\s\S]{0,400}?timerSeconds !== null[\s\S]{0,300}?const wordsRead =[\s\S]{0,100}?passageStarted[\s\S]{0,220}?: 0/,
  "core scoring must not manufacture passage words before the passage starts"
);
requireTeacherPagePattern(
  /function hasRecordedPassageAssessment[\s\S]{0,500}?totalPart1Score > 10[\s\S]{0,180}?timer_seconds !== null[\s\S]{0,500}?if \(!hasRecordedPassageAssessment\(assessment\)\)[\s\S]{0,80}?return 0/,
  "assessment records must show zero words for every Part 1 early stop"
);
requireExcelReportPattern(
  /const PASSAGE_WORD_COUNT = 100[\s\S]{0,9000}?const passageWasAdministered =[\s\S]{0,220}?totalScore > 10[\s\S]{0,160}?timerSeconds !== null[\s\S]{0,300}?const wordsRead =[\s\S]{0,120}?passageWasAdministered[\s\S]{0,220}?: 0/,
  "the scoresheet must use the official denominator only for an administered passage"
);

console.log(
  "Verified assessment invariants: CRLA stop rules, passage results, comprehension responses, miscues, and non-blocking transitions are enforced."
);
