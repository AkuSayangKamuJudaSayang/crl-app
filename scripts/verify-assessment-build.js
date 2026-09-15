const fs = require("node:fs");
const path = require("node:path");

/*
 * Every source check below anchors on exact multi-line text. Windows checkouts
 * materialise the tracked LF blobs as CRLF (core.autocrlf), which silently
 * breaks those anchors and makes `npm run dev` / `npm run build` fail before
 * Next.js even starts. Normalise line endings so the gate inspects the same
 * text on every platform.
 */
function readSource(...segments) {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), "utf8")
    .replace(/\r\n/g, "\n");
}

const source = readSource(
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);
const routeSource = readSource(
  "app",
  "api",
  "assessment",
  "route.js"
);
const learnerSource = readSource(
  "app",
  "learner",
  "LearnerAssessmentPage.jsx"
);
const teacherPageSource = readSource(
  "app",
  "teacher",
  "page.jsx"
);
const excelReportSource = readSource(
  "app",
  "api",
  "reports",
  "excel",
  "route.js"
);
const offlineRuntimeSource = readSource(
  "app",
  "components",
  "OfflineRuntime.jsx"
);
const offlineDatabaseSource = readSource(
  "lib",
  "teacherOfflineDb.js"
);
const teacherPreloadSource = readSource(
  "app",
  "components",
  "TeacherOfflinePreload.jsx"
);
const serviceWorkerSource = readSource(
  "public",
  "sw.js"
);
const classImportSource = readSource(
  "app",
  "teacher",
  "ClassRecordImport.jsx"
);
const offlineClassImportSource = readSource(
  "lib",
  "offlineClassRecordImport.js"
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

function requireOfflinePattern(pattern, message) {
  if (!pattern.test(offlineRuntimeSource)) {
    throw new Error(`Offline runtime invariant failed: ${message}`);
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
if (
  !wordRouteBlock.includes("isFinalWord && hasCompleteTask1Snapshot") ||
  !wordRouteBlock.includes("letterTaskResult.createMany(")
) {
  throw new Error(
    "Assessment route invariant failed: the Part 1 stop must repair the complete Letter Sounds journal before it is scored"
  );
}
requirePattern(
  /function isTeacherStageRegression/,
  "teacher stage ordering must be defined"
);
requirePattern(
  /function mergeMonotonicTeacherSession[\s\S]{0,500}?isTeacherStageRegression\(incomingStage, currentStage\)[\s\S]{0,1000}?incomingIndex < currentIndex[\s\S]{0,800}?currentStage === ["']comprehension["']/,
  "all teacher snapshots must reject older stages, scored items, and comprehension questions"
);
requirePattern(
  /currentStage === ["']passage["'] && incomingStage === ["']passage["'][\s\S]{0,500}?current\.passageStartedAt/,
  "a confirmed passage start must be sticky across stale server snapshots"
);
const monotonicMergeCount = source.split("mergeMonotonicTeacherSession(").length - 1;
if (monotonicMergeCount < 8) {
  throw new Error(
    `Assessment invariant failed: every asynchronous transition must use monotonic reconciliation; expected at least 8, found ${monotonicMergeCount}`
  );
}
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
  !experienceRouteBlock.includes("comprehensionResult.deleteMany(") ||
  !experienceRouteBlock.includes("comprehensionResult.createMany(") ||
  !experienceRouteBlock.includes("passageMiscue.deleteMany(") ||
  !experienceRouteBlock.includes("safeCalculateMetrics(")
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
  !experienceRouteBlock.includes('["learner_experience", "comprehension", "passage"].includes(host.stage)') ||
  !experienceRouteBlock.includes("submittedComprehension.map(") ||
  !experienceRouteBlock.includes("stage: { in: [\"learner_experience\", \"comprehension\", \"passage\"] }")
) {
  throw new Error(
    "Assessment route invariant failed: the learner experience rating must tolerate the final-comprehension transition race"
  );
}
if (
  experienceRouteBlock.includes("prisma.$transaction(async") ||
  experienceRouteBlock.includes("calculateMetrics(tx")
) {
  throw new Error(
    "Assessment route invariant failed: learner experience persistence must not use an expiring interactive transaction"
  );
}
if (!/return await calculateMetrics\(prisma, assessmentSessionId\)/.test(routeSource)) {
  throw new Error(
    "Assessment route invariant failed: recoverable metrics refresh must not use an interactive transaction"
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
  /Starting the visible clock is irreversible[\s\S]{0,800}?boundary:passage_ready:[\s\S]{0,300}?started_at:\s*startedAt/,
  "a failed passage-start request must retry without resetting the visible timer"
);
rejectPattern(
  /catch \(startError\) \{[\s\S]{0,800}?passage_started_at:\s*null/,
  "a passage-start failure must never reveal Start Reading or reset elapsed time"
);
requirePattern(
  /activeStage !== ["']passage["'] \|\|[\s\S]{0,100}?storySelecting \|\|[\s\S]{0,100}?!passageStageConfirmed/,
  "the passage timer must wait for durable story selection"
);
requirePattern(
  /catch \(error\) \{[\s\S]{0,600}?stage: ["']story_choice["'][\s\S]{0,500}?setActiveStage\(["']story_choice["']\)/,
  "a failed story selection must return to a retryable Story Choice state"
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
  /const part1ResultsDraftRef = useRef\([\s\S]{0,180}?task1Results: \[\],[\s\S]{0,80}?task2Results: \[\]/,
  "Part 1 answers must have an independent local journal"
);
requirePattern(
  /part1-results:\$\{String\(code\)\.toUpperCase\(\)\}[\s\S]{0,220}?nextDraft/,
  "every Part 1 answer must be persisted to the local assessment database"
);
requirePattern(
  /part1ResultsSavePromiseRef\.current\s*=[\s\S]{0,260}?saveAssessmentState\(/,
  "local Part 1 journal writes must be serialized so an older snapshot cannot overwrite a newer one"
);
requirePattern(
  /await finalWordSavePromiseRef\.current;[\s\S]{0,100}?await part1ResultsSavePromiseRef\.current;/,
  "final review must wait for the durable local Part 1 journal"
);
requirePattern(
  /mergeReviewTaskResults\([\s\S]{0,120}?incomingSession\.task2Results,[\s\S]{0,100}?currentDraft\.task2Results/,
  "polling must reconcile rather than erase locally recorded Word Recognition answers"
);
requirePattern(
  /task1_results: task1Results,[\s\S]{0,80}?task2_results: task2Results/,
  "final review must submit the reconciled Part 1 answer journal"
);
requirePattern(
  /hasCompletePart1Journal[\s\S]{0,1200}?journalTask1Results\.filter\(\(item\) => item\.isCorrect === true\)/,
  "the completion overlay must report Part 1 from the teacher journal"
);
rejectPattern(
  /metrics\.totalPart1Score/,
  "the completion overlay must not take the Part 1 total from lagging server metrics"
);
requireRoutePattern(
  /All Letter Sounds and Word Recognition responses are required before saving\./,
  "the API must reject a partial Part 1 stop snapshot"
);
requireRoutePattern(
  /if \(hasSubmittedTask2Snapshot\)[\s\S]{0,350}?wordTaskResult\.deleteMany[\s\S]{0,350}?wordTaskResult\.createMany/,
  "the API must atomically replace Word Recognition rows from the complete final snapshot"
);
requireRoutePattern(
  /const hasSubmittedPart1StopSnapshot =\s*\n\s*hasSubmittedPart1Complete &&\s*\n\s*submittedPart1Total <= 10/,
  "the API must derive a Part 1 stop from the submitted journal, not only from a client flag"
);
requireRoutePattern(
  /const hasSubmittedZeroSnapshot =\s*\n\s*reviewLetters\.length > 0/,
  "an empty review content set must never satisfy the zero-score snapshot rule"
);
requireRoutePattern(
  /hasCompleteSnapshot[\s\S]{0,1200}?letterTaskResult\.createMany[\s\S]{0,1200}?persist_only === true/,
  "a queued Letter 10 replay must repair the Part 1 rows before it returns"
);
const recordWordBlock = sourceBlock(
  source,
  "const recordWord =",
  "const recordComprehension ="
);
if (recordWordBlock.includes("await finalLetterSavePromiseRef.current")) {
  throw new Error(
    "Assessment invariant failed: an accepted Word Recognition click must never wait synchronously for the Letter Sounds save"
  );
}
requirePattern(
  /const letterBoundaryPromise = finalLetterSavePromiseRef\.current[\s\S]{0,1800}?letterBoundaryPromise[\s\S]{0,180}?queueAnswerForBackgroundSave\([\s\S]{0,80}?["']record_word["']/,
  "the first Word Recognition save must preserve Letter-to-Word ordering in the background"
);
requirePattern(
  /releasedWordTransitionGateKeysRef[\s\S]{0,900}?releaseFirstWordControls[\s\S]{0,500}?\.add\(gateKey\)[\s\S]{0,500}?setWordInitialTransitionPending\(false\)/,
  "learner readiness must permanently release the first-word restraint for its session"
);
requirePattern(
  /incomingStage === currentStage[\s\S]{0,180}?["']letter["'], ["']word["'][\s\S]{0,300}?incomingItemIndex < currentItemIndex[\s\S]{0,80}?return/,
  "polling must not move Letter Sounds or Word Recognition back to an older item"
);
requirePattern(
  /activeStage === ["']comprehension["'][\s\S]{0,100}?`comprehension:\$\{questionIndex\}`/,
  "answer locks must follow the current comprehension item"
);
requirePattern(
  /const currentAnswerRestraintKey =[\s\S]{0,500}?letterIndex[\s\S]{0,160}?wordIndex[\s\S]{0,200}?questionIndex/,
  "Letter, Word, and Comprehension must share an item-keyed restraint"
);
requirePattern(
  /answerRestraintTimerRef\.current = window\.setTimeout\([\s\S]{0,220}?setReleasedAnswerRestraintKey\(currentAnswerRestraintKey\)[\s\S]{0,80}?, 2000\)/,
  "each scored item must remain non-pressable for exactly two seconds"
);
requireCount(
  "answerRestraintPending ||",
  6,
  "all six answer buttons must enforce the shared restraint"
);
for (const handler of ["recordLetter", "recordWord", "recordComprehension"]) {
  const block = sourceBlock(
    source,
    `const ${handler} =`,
    handler === "recordLetter"
      ? "const recordWord ="
      : handler === "recordWord"
        ? "const recordComprehension ="
        : "const saveLearnerExperienceRating ="
  );
  if (!block.includes("answerRestraintPending")) {
    throw new Error(
      `Assessment invariant failed: ${handler} must reject programmatic input during the shared restraint`
    );
  }
}
requirePattern(
  /\[["']letter["'], ["']word["']\]\.includes\(activeStage\)[\s\S]{0,180}?transitionPending[\s\S]{0,120}?!pendingAnswerRef\.current[\s\S]{0,120}?setTransitionPending\(false\)/,
  "completed Letter and Word transitions must not leave a stale restraint"
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
  "the zero-score learner state must remain stable until code-entry reset"
);
requireLearnerPattern(
  /function LearnerToolbar[\s\S]{0,7000}?z-index:\s*5100[\s\S]{0,7000}?z-index:\s*6000/,
  "connection and exit dialogs must cover and dim the persistent learner toolbar"
);
requireLearnerCount(
  "<LearnerToolbar",
  1,
  "connection settings and Exit App must render only in the code-entry shell"
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

if (
  !/return entries[\s\S]{0,180}?\.map\(\(entry\) => entry\?\.value\)[\s\S]{0,220}?createdAt/.test(
    offlineDatabaseSource
  )
) {
  throw new Error(
    "Offline database invariant failed: the reconnect outbox must return stored mutations in creation order"
  );
}
if (!/signedOut: true[\s\S]{0,100}?signedOutAt: Date\.now\(\)/.test(offlineDatabaseSource)) {
  throw new Error(
    "Offline database invariant failed: logout must persist a signed-out tombstone"
  );
}
requireOfflinePattern(
  /function isActiveOfflineSession[\s\S]{0,220}?!session\.signedOut/,
  "signed-out sessions must never authenticate an offline request"
);
requireOfflinePattern(
  /entry\.kind === ["']host_start["'][\s\S]{0,1600}?hostCodeMap\.set\(offlineCode, serverCode\)/,
  "offline host codes must be translated before ordered cloud replay"
);
requireOfflinePattern(
  /entry\.kind === ["']add_learner["'][\s\S]{0,900}?learnerIdMap\.set[\s\S]{0,1200}?rewriteQueuedReferences/,
  "offline learner IDs must be reconciled before their assessments sync"
);
const syncOutboxBlock = sourceBlock(
  offlineRuntimeSource,
  "async function syncOutbox()",
  "async function offlineTeacherData(action)"
);
if (
  !/if \(!response\.ok\) break;/.test(syncOutboxBlock) ||
  !/catch \{[\s\S]{0,180}?break;/.test(syncOutboxBlock)
) {
  throw new Error(
    "Offline runtime invariant failed: cloud replay must stop at the first rejected mutation to preserve assessment order"
  );
}
requireOfflinePattern(
  /action === ["']save_final_assessment_review["'][\s\S]{0,1800}?offlineAssessmentRecord[\s\S]{0,500}?setSnapshot/,
  "a completed offline assessment must be stored locally with full scoring data"
);
requireOfflinePattern(
  /localHost\?\.offline_created[\s\S]{0,250}?handleOfflineAssessment/,
  "an active offline assessment must keep its local code across reconnection"
);
if (!/if \(existingSession\?\.signedOut\) return;/.test(teacherPreloadSource)) {
  throw new Error(
    "Offline preload invariant failed: a late preload must not undo teacher logout"
  );
}
if (!/crla-pwa-v16/.test(serviceWorkerSource) || !/event\.waitUntil\(cacheUrls\(APP_SHELL\)\)/.test(serviceWorkerSource)) {
  throw new Error(
    "Service worker invariant failed: the current teacher shell must cache routes independently"
  );
}
if (
  !/importClassRecordOffline/.test(classImportSource) ||
  !/action: ["']add_learner["']/.test(offlineClassImportSource)
) {
  throw new Error(
    "Offline import invariant failed: class-record learners must be stored through the local-first learner path"
  );
}
if (
  !/@media \(max-width: 768px\)/.test(teacherPageSource) ||
  !/@media \(max-width: 480px\)/.test(teacherPageSource)
) {
  throw new Error(
    "Teacher UI invariant failed: tablet and phone responsive breakpoints must remain available"
  );
}

console.log(
  "Verified assessment invariants: CRLA scoring, two-second restraints, passage sequencing, logout, offline records, and ordered cloud synchronization are enforced."
);
