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
const landingCssSource = readSource("app", "landing.module.css");
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
const channelSource = readSource(
  "lib",
  "assessmentChannel.js"
);
const peerSource = readSource(
  "lib",
  "assessmentPeer.js"
);
const learnerServiceWorkerSource = readSource(
  "public",
  "learner-pwa-sw.js"
);
const localPairingSource = readSource(
  "components",
  "LocalAssessmentPairing.jsx"
);
const assessmentCodeScannerSource = readSource(
  "components",
  "AssessmentCodeScanner.jsx"
);
const connectionChoiceSource = readSource(
  "components",
  "AssessmentConnectionChoice.jsx"
);
const policyGateSource = readSource(
  "app",
  "components",
  "PolicyConsentGate.jsx"
);
const prismaSource = readSource(
  "lib",
  "prisma.js"
);
const assessmentContentSource = readSource(
  "lib",
  "assessmentContent.js"
);

function requirePrismaPattern(pattern, message) {
  if (!pattern.test(prismaSource)) {
    throw new Error(`Prisma connection invariant failed: ${message}`);
  }
}

/*
 * Latency invariants.
 *
 * A single database round trip costs a fixed amount of wall-clock time, so the
 * number of SEQUENTIAL queries per request is what the user actually feels.
 * These guard the reductions that made the assessment responsive:
 *  - per-item writes must not run a whole-session rescore,
 *  - runtime must prefer the connection mode without the transaction-pooler
 *    per-query penalty.
 */
requireRoutePattern(
  /persist_only === true\) \{\s*return responseJson\(\{\s*status: "ok",\s*saved: true,\s*result,/,
  "one comprehension answer must not trigger a whole-session rescore"
);
requireRoutePattern(
  /persist_only === true\) \{\s*return responseJson\(\{\s*status: "ok",\s*saved: true,\s*result: \{/,
  "editing a passage miscue must not trigger a whole-session rescore"
);
/*
 * Connection-safety invariants.
 *
 * The session pooler is faster per query but is capped at pool_size clients in
 * total, so using it by default made a scaled deployment fail with
 * EMAXCONNSESSION mid-assessment; the flag-less transaction pooler breaks
 * prepared statements. Only the documented transaction-pooler mode survived
 * concurrency, so it must stay the default, the faster mode must stay opt-in,
 * and transient pooler refusals must be retried rather than surfaced as a 500.
 */
requirePrismaPattern(
  /const preferSessionMode = process\.env\.CRL_DB_MODE === "session"/,
  "the session pooler must be opt-in, never the default"
);
requirePrismaPattern(
  /RETRYABLE_DB_PATTERNS/,
  "transient pooler failures must be recognised as retryable"
);
requirePrismaPattern(
  /withDatabaseRetry/,
  "model queries must go through the connection retry wrapper"
);
requirePrismaPattern(
  /searchParams\.set\("pgbouncer", "true"\)/,
  "the transaction pooler must keep the flag it requires"
);

function requirePattern(pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(`Assessment invariant failed: ${message}`);
  }
}

function requireChannelPattern(pattern, message) {
  if (!pattern.test(channelSource)) {
    throw new Error(`Realtime channel invariant failed: ${message}`);
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
/*
 * The learner now lays the passage out as soon as it arrives, behind a
 * "Get ready" veil, and confirms with a "passage_rendered" control packet. The
 * guarantee this gate protects is unchanged in spirit and stronger in effect:
 * the learner must not be able to read the passage, and the reading clock must
 * not start, until the teacher starts the reading AND the whole passage is
 * genuinely laid out on the learner's screen. Rendering it only after the timer
 * had already started is what let the clock run against a blank screen.
 */
requireLearnerPattern(
  /style=\{passageHasStarted \? undefined : \{ visibility: ["']hidden["'] \}\}/,
  "the passage must stay hidden from the learner until the teacher starts the reading"
);
requireLearnerPattern(
  /action:\s*["']passage_rendered["']/,
  "the learner must confirm that the whole passage is laid out on screen"
);
requireLearnerPattern(
  /action:\s*["']passage_visible["']/,
  "the learner must confirm when the passage is genuinely painted"
);
requireLearnerPattern(
  /stage\s*===\s*["']passage["']\s*&&\s*\(\s*<div>/,
  "the passage must be laid out as soon as its stage is active so the reveal is instant"
);
requirePattern(
  /await waitForLearnerPassage\(/,
  "the teacher must wait for the learner's passage-render confirmation before starting the clock"
);
requirePattern(
  /const PASSAGE_RENDER_WAIT_MS = \d+/,
  "the passage-render wait must have a bounded fallback so a lost packet cannot strand the teacher"
);
/*
 * Cross-device item propagation.
 *
 * An optimistic teacher broadcast is built from the last server snapshot, so it
 * inherits that snapshot's timestamp. The learner must therefore never discard a
 * packet that advances the item just because its timestamp looks old, and a
 * single lost advance must not be able to stall every later item.
 */
requireChannelPattern(
  /function withOptimisticStamp\(session\)[\s\S]{0,500}?updated_at: isoTimestamp/,
  "outbound teacher state must carry a fresh monotonic timestamp"
);
requireChannelPattern(
  /publishAssessmentRealtimeState[\s\S]{0,220}?withOptimisticStamp\(session\)/,
  "cross-device teacher state must be stamped before publishing"
);
requireChannelPattern(
  /const realtimeChannelEntries = new Map\(\)/,
  "each assessment topic must share one realtime channel entry"
);
requireChannelPattern(
  /createAssessmentRealtimeChannel[\s\S]{0,260}?getRealtimeChannelEntry\(topic\)/,
  "realtime listeners must reuse the shared topic channel"
);
requireChannelPattern(
  /async function getPublisherChannel\(topic\)[\s\S]{0,180}?getRealtimeChannelEntry\(topic\)/,
  "realtime publishers must reuse the shared topic channel"
);
requireLearnerPattern(
  /const movesForward = isForwardSessionMove\(incoming, current\)/,
  "the learner must recognise a forward item move"
);
requireLearnerPattern(
  /source === ["']broadcast["'] &&\s*!movesForward/,
  "the learner must not reject an advancing broadcast for looking old"
);
requireLearnerPattern(
  /if \(acceptedVersion\) \{\s*lastRealtimeVersionRef\.current = acceptedVersion/,
  "the realtime watermark must only advance for an accepted packet"
);
requirePattern(
  /const healStaleHostAdvance =\s*useCallback\(/,
  "a stale host advance must be reconciled instead of silently ignored"
);
requirePattern(
  /data\?\.stale && data\?\.session\) \{\s*\/?[\s\S]{0,400}?healStaleHostAdvance\(data\.session\)/,
  "the Word Recognition advance must heal a stale host session"
);
requireRoutePattern(
  /LIVE_CONTENT_CACHE_TTL_MS = \d+/,
  "the live content catalogue must be cached so it stops competing with the assessment writes"
);
requireRoutePattern(
  /action === "host_advance"[\s\S]{0,5000}?hostSession\.updateManyAndReturn/,
  "the latency-critical host advance must update and return in one database round trip"
);
requireRoutePattern(
  /const runtimeAssessmentContent = isBackgroundWordWrite[\s\S]{0,120}?\? null[\s\S]{0,120}?: await getLiveAssessmentContent/,
  "per-item Word Recognition persistence must not reload the content catalogue"
);
requireRoutePattern(
  /invalidateLiveAssessmentContent\((?:userId|teacherId)\)/,
  "saving assessment content must invalidate the cached catalogue"
);
requireRoutePattern(
  /if\s*\(action\s*===\s*["']passage_ready["']\)[\s\S]{0,500}?requireTeacher\(request\)[\s\S]{0,700}?teacherId:\s*timerAuth\.userId/,
  "only the authenticated teacher may start the passage timer"
);
requirePattern(
  /const startPassageTimer\s*=\s*useCallback\([\s\S]{0,4000}?action:\s*["']passage_ready["']/,
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
  /View miscues[\s\S]{0,6000}?reviewPassageWords\.map\([\s\S]{0,6000}?Position \{Number\(item\.wordIndex\) \+ 1\}/,
  "the final review must disclose each exact miscue on demand, highlighted in the full passage"
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
  /const nextComprehension\s*=\s*recordComprehensionResult\([\s\S]{0,2600}?publishAssessmentState\([\s\S]{0,400}?publishAssessmentRealtimeState\(code, nextSession\)/,
  "the next comprehension question must publish optimistically"
);
requirePattern(
  /comprehensionPersistPromiseRef\.current = \(async \(\) => \{[\s\S]{0,700}?persistAnswerWithRetry\(\s*["']record_comprehension["']/,
  "a comprehension answer must be persisted directly, not only queued"
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
  /const letterBoundaryPromise = finalLetterSavePromiseRef\.current[\s\S]{0,3000}?await letterBoundaryPromise[\s\S]{0,1200}?persistAnswerWithRetry\(\s*["']record_word["'][\s\S]{0,800}?queueAnswerForBackgroundSave\(\s*["']record_word["']/,
  "the first Word Recognition save must keep Letter-to-Word ordering while persisting directly, with the queue only as a fallback"
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
  /onClick=\{saveTerminationObservation\}[\s\S]{0,600}?disabled=\{savingTerminationObservation\}/,
  "the save button must be pressable in one attempt and never dead while a field is missing"
);
requirePattern(
  /Select an Observation Level \(1-4\) before saving this assessment\./,
  "a missing Observation Level must be reported to the teacher instead of silently blocking Save"
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
  /const PASSAGE_WORD_COUNT = 100[\s\S]{0,9000}?const passageWasAdministered =[\s\S]{0,220}?totalScore > 10[\s\S]{0,160}?timerSeconds !== null[\s\S]{0,300}?const wordsRead =[\s\S]{0,120}?passageWasAdministered[\s\S]{0,220}?: null/,
  "the scoresheet must leave non-administered passage cells blank"
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
requireOfflinePattern(
  /function mergeCachedLearners\(cached, cloud, tombstones[\s\S]{0,700}?learner\?\.offline_pending[\s\S]{0,350}?sameLearner/,
  "pending offline learners must survive cloud roster refreshes while delete tombstones stay hidden"
);
requireOfflinePattern(
  /function replaceLearnerReferencesInBody[\s\S]{0,700}?learner_ids[\s\S]{0,250}?Number\(serverId\)/,
  "bulk learner operations must remap offline learner IDs before cloud replay"
);
requireOfflinePattern(
  /action === ["']host_start["'][\s\S]{0,700}?requestedLearnerId < 0 \|\| pendingLearner\?\.offline_pending[\s\S]{0,350}?handleOfflineAssessment/,
  "a newly added offline learner must remain immediately assessable during reconnect"
);
requireOfflinePattern(
  /const cloudLearners = normalizeLearners\(payload\)[\s\S]{0,650}?current\.learnerTombstones[\s\S]{0,500}?const learners = nextSnapshot\.learners[\s\S]{0,500}?return jsonResponse\(\{ \.\.\.\(payload \|\| \{\}\), learners \}\)/,
  "the visible online roster must receive the reconciled cloud and IndexedDB learner list"
);
if (
  !/existing\.teacherId[\s\S]{0,260}?already_exists: true/.test(routeSource) ||
  !/already_deleted: true/.test(routeSource)
) {
  throw new Error(
    "Learner replay invariant failed: add and delete retries must be idempotent after a lost cloud response"
  );
}
if (
  !/crl-teacher-data-updated/.test(teacherPageSource) ||
  !/aria-label="Refresh enrolled learners"/.test(teacherPageSource)
) {
  throw new Error(
    "Teacher roster invariant failed: cloud reconciliation must refresh automatically and expose the icon-only manual refresh control"
  );
}
const syncOutboxBlock = sourceBlock(
  offlineRuntimeSource,
  "async function performOutboxSync()",
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
  /action === ["']save_final_assessment_review["'][\s\S]{0,1800}?offlineAssessmentRecord[\s\S]{0,500}?updateSnapshot/,
  "a completed offline assessment must be stored locally with full scoring data"
);
requireOfflinePattern(
  /localHost\?\.offline_created \|\| localHost\?\.local_pending_sync[\s\S]{0,250}?handleOfflineAssessment/,
  "offline-created or locally pending assessments must remain local-first across reconnection"
);
requireOfflinePattern(
  /local_pending_sync:[\s\S]{0,120}?Boolean\(next\.local_pending_sync\) \|\| queuesMutation/,
  "an interrupted online assessment must stay local-first until its ordered journal drains"
);
if (!/if \(existingSession\?\.signedOut\) return;/.test(teacherPreloadSource)) {
  throw new Error(
    "Offline preload invariant failed: a late preload must not undo teacher logout"
  );
}
if (
  !/crla-pwa-v24/.test(serviceWorkerSource) ||
  !/event\.waitUntil\(cacheUrls\(APP_SHELL\)\)/.test(serviceWorkerSource) ||
  !/await cacheDocumentDependencies\(response\)/.test(serviceWorkerSource) ||
  !/url\.pathname\.startsWith\("\/_next\/static\/"\)/.test(serviceWorkerSource)
) {
  throw new Error(
    "Service worker invariant failed: the current teacher shell must cache routes and their build chunks independently"
  );
}
if (!/caches\.match\(url\.pathname\)/.test(serviceWorkerSource)) {
  throw new Error(
    "Service worker invariant failed: offline assessment navigation must resolve its cached pathname before the dashboard fallback"
  );
}
if (
  !/currentContent: "Assessment invitation expired\."/.test(routeSource) ||
  !/onClick=\{[\s\S]{0,100}?joined[\s\S]{0,100}?endSession[\s\S]{0,100}?confirmEndSessionAction/.test(source)
) {
  throw new Error(
    "Assessment lifecycle invariant failed: leaving an unjoined assessment must expire its invitation code"
  );
}
if (
  !/stage: "waiting"[\s\S]{0,180}?connected: false/.test(offlineRuntimeSource) ||
  !/existing\.ended && action === "learner_join"/.test(offlineRuntimeSource)
) {
  throw new Error(
    "Offline assessment invariant failed: a fresh code must wait for a learner and expired codes must reject joins"
  );
}
if (
  !/showWellDoneAndReset/.test(learnerSource) ||
  !/setStatusMessage\("Well Done"\)[\s\S]{0,500}?, 3000\)/.test(learnerSource)
) {
  throw new Error(
    "Learner completion invariant failed: successful completion must show Well Done for three seconds"
  );
}
if (
  !/duplicateLearnerRowIds/.test(teacherPageSource) ||
  !/This LRN is already registered\./.test(teacherPageSource)
) {
  throw new Error(
    "Learner roster invariant failed: duplicate LRNs must be identified before Save"
  );
}
if (
  !/pathname === "\/login"/.test(policyGateSource) ||
  !/pathname === "\/learner"/.test(policyGateSource) ||
  !/window\.location\.replace\("\/"\)/.test(policyGateSource)
) {
  throw new Error(
    "Privacy invariant failed: protected teacher and learner routes must return unconsented users to the landing page"
  );
}
if (
  !/new RTCPeerConnection\(\{ iceServers: \[\]/.test(peerSource) ||
  !/createDataChannel\("crl-assessment", \{ ordered: true \}\)/.test(peerSource) ||
  !/publishAssessmentPeerState/.test(channelSource) ||
  !/publishAssessmentPeerControl/.test(channelSource)
) {
  throw new Error(
    "Local connectivity invariant failed: assessment state and controls must retain the direct hotspot peer path"
  );
}
if (
  /USB|usb|tether/.test(localPairingSource) ||
  !/Scan teacher QR/.test(localPairingSource) ||
  !/Scan learner response/.test(localPairingSource) ||
  !/Use teacher connection code/.test(localPairingSource) ||
  !/Accept learner response/.test(localPairingSource) ||
  !/initialOffer=\{localOffer\}/.test(learnerSource) ||
  !/localPairingEnabled \? \([\s\S]{0,180}?<LocalAssessmentPairing/.test(source)
) {
  throw new Error(
    "Local pairing invariant failed: offline setup must expose the teacher invitation and support QR or camera-free codes in both directions"
  );
}
if (
  !/code: offlineCode/.test(offlineRuntimeSource) ||
  !/Math\.floor\(Math\.random\(\) \* ASSESSMENT_CODE_ALPHABET\.length\)/.test(offlineRuntimeSource) ||
  !/offline_code[\s\S]{0,800}?\^\[A-HJ-NP-Z2-9\]\{6\}\$/.test(routeSource)
) {
  throw new Error(
    "Offline code invariant failed: offline and cloud sessions must preserve one six-character code"
  );
}
if (/\{isOnline && \([\s\S]{0,120}?crlAssessmentCodeQr/.test(source)) {
  throw new Error(
    "Assessment invitation invariant failed: the QR must remain visible without internet"
  );
}
const learnerInstallBlock = sourceBlock(
  learnerServiceWorkerSource,
  'self.addEventListener("install"',
  'self.addEventListener("message"'
);
if (/warmShell/.test(learnerInstallBlock)) {
  throw new Error(
    "Learner PWA invariant failed: installation must not wait for offline shell downloads"
  );
}
/*
 * Connectivity UI: the learner keeps its own connection settings, and the
 * teacher's assessment shows the offline pairing confirmer whenever the run is
 * offline. The code card must not carry a connection-settings panel or an
 * offline-mode switch, because the mode is chosen on the dashboard before the
 * assessment starts - online those controls do nothing, and offline the switch
 * could only re-run a discovery that already ran.
 */
if (
  !/LocalAssessmentPairing/.test(learnerSource) ||
  !/<LocalAssessmentPairing[\s\S]{0,200}?role="teacher"[\s\S]{0,200}?offline/.test(
    source
  )
) {
  throw new Error(
    "Local connectivity UI invariant failed: the teacher's offline run and the learner's join must both expose the pairing confirmer"
  );
}
if (/ConnectionHealthPanel|OfflineModeButton|showConnectionSettings/.test(source)) {
  throw new Error(
    "Local connectivity UI invariant failed: the assessment code card must not offer connection settings or an offline-mode switch"
  );
}
/*
 * The mode chooser offers only the mode this device can run.
 */
if (
  !/isProbablyOnline/.test(connectionChoiceSource) ||
  !/disabled=\{!online \|\| checking\}/.test(connectionChoiceSource) ||
  !/disabled=\{online \|\| checking\}/.test(connectionChoiceSource)
) {
  throw new Error(
    "Local connectivity UI invariant failed: the mode chooser must block offline mode while the device is online and online mode while it is not"
  );
}
/*
 * Learner side: the offline switch belongs in Connection Settings beside the
 * network state, not on the join card where it did nothing while online, and it
 * follows the same rule as the teacher's chooser.
 */
if (
  /normalizeCode\(codeInput\)\.length === 6\) setShowConnectionSettings\(true\)/.test(
    learnerSource
  )
) {
  throw new Error(
    "Local connectivity UI invariant failed: the learner's join card must not carry its own offline-mode switch"
  );
}
if ((learnerSource.match(/<OfflineModeButton/g) || []).length !== 2) {
  throw new Error(
    "Local connectivity UI invariant failed: the learner must reach offline mode from Connection Settings on both screens"
  );
}
if (
  !/function canRunOfflineMode\(/.test(learnerSource) ||
  !/navigator\.onLine === false\) return true/.test(learnerSource) ||
  !/disabled=\{!canRunOfflineMode\(networkSnapshot\)/.test(learnerSource) ||
  !/onRequestOfflineMode/.test(learnerSource)
) {
  throw new Error(
    "Local connectivity UI invariant failed: the learner's offline switch must be blocked while the device has an internet connection"
  );
}
/*
 * A learner is never asked for a hub address: the teacher's QR carries it and a
 * hub on the school network answers to its own name, so the field is a setup
 * control and belongs to the teacher alone.
 */
if (
  !/role === "teacher" \? <>[\s\S]{0,600}?Hub address/.test(localPairingSource)
) {
  throw new Error(
    "Local connectivity UI invariant failed: only the teacher may be asked for a hub address"
  );
}
/*
 * Scanning is the path that needs no setup, so it has to stand on its own: the
 * code is shown full screen for easy scanning without a hub, and the typed-code
 * field appears only once a hub is configured instead of sitting there unusable.
 * The hub itself is offered as an optional extra, never as a requirement.
 */
if (
  !/onClick=\{\(\) => setFullscreenQr\(true\)\}/.test(localPairingSource) ||
  !/local-pair-fullscreen-qr/.test(localPairingSource) ||
  !/Show full screen/.test(localPairingSource) ||
  !/Step 1 of 2/.test(localPairingSource) ||
  !/Step 2 of 2/.test(localPairingSource)
) {
  throw new Error(
    "Local connectivity UI invariant failed: the pairing QR must be scannable full screen and the two devices must be walked through the steps"
  );
}
if (
  !/\{hubAddress \? <>\s*<label className="local-pair-code-field" htmlFor=\{inputId\}>/.test(
    localPairingSource
  ) ||
  !/Optional: connection codes instead of scanning/.test(localPairingSource)
) {
  throw new Error(
    "Local connectivity UI invariant failed: the typed-code alternative must appear only with a hub, and only as an optional extra"
  );
}
if (
  !/Scan QR Code/.test(learnerSource) ||
  !/AssessmentCodeScanner/.test(learnerSource) ||
  !/readAssessmentCodeQr/.test(assessmentCodeScannerSource) ||
  !/createPortal/.test(assessmentCodeScannerSource) ||
  !/role="dialog"/.test(assessmentCodeScannerSource) ||
  !/aria-modal="true"/.test(assessmentCodeScannerSource) ||
  !/qr-scanner-frame/.test(assessmentCodeScannerSource) ||
  !/Focus Camera/.test(assessmentCodeScannerSource) ||
  !/applyConstraints/.test(assessmentCodeScannerSource)
) {
  throw new Error(
    "Learner join invariant failed: code entry and the focusable QR scanner overlay must both remain available"
  );
}
if (
  !/action: "peer_joined"/.test(learnerSource) ||
  !/publishAssessmentRealtimeControl\(code, control\)/.test(learnerSource) ||
  !/onPeerConnected=\{markLearnerConnected\}/.test(source)
) {
  throw new Error(
    "Assessment connection invariant failed: learner join acknowledgement must reach the teacher through online and direct transports"
  );
}
requireTeacherPagePattern(
  /if \(result\?\.offline\)[\s\S]{0,500}?window\.location\.assign\(assessmentUrl\)/,
  "offline assessment start must use a cached document navigation instead of an unavailable RSC transition"
);
if (
  /storyChoiceIcon/.test(source) ||
  /className="story-icon"/.test(learnerSource)
) {
  throw new Error(
    "Story choice invariant failed: teacher and learner story cards must remain text-only"
  );
}
for (const fontFile of ["OpenDyslexic-Regular.woff2", "OpenDyslexic-Bold.woff2"]) {
  if (
    !fs.existsSync(path.join(process.cwd(), "public", "fonts", fontFile)) ||
    !serviceWorkerSource.includes(`/fonts/${fontFile}`) ||
    !learnerServiceWorkerSource.includes(`/fonts/${fontFile}`) ||
    !/url\.pathname\.startsWith\("\/fonts\/"\)/.test(learnerServiceWorkerSource)
  ) {
    throw new Error(
      `Dyslexic font invariant failed: ${fontFile} must be bundled and cached for offline reading`
    );
  }
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

const assessmentPostBlock = sourceBlock(
  routeSource,
  "export async function POST",
  "Unknown assessment action:"
);
if (
  !/action === "save_activities"/.test(assessmentPostBlock) ||
  !/persistTeacherAssessmentPeriod/.test(assessmentPostBlock)
) {
  throw new Error(
    "Manage Assessment invariant failed: content saves must be handled by the authenticated POST route"
  );
}
if (
  !/stories: \[\],[\s\S]{0,80}?\},\s*EoSY:[\s\S]{0,160}?stories: \[\]/.test(
    assessmentContentSource
  ) ||
  !/storyWords: 100/.test(assessmentContentSource)
) {
  throw new Error(
    "Manage Assessment invariant failed: MoSY/EoSY stories must start empty and passages must contain exactly 100 words"
  );
}
if (
  !/activityEditor\.storyWords\.map/.test(teacherPageSource) ||
  !/Save changes\?/.test(teacherPageSource) ||
  !/beforeunload/.test(teacherPageSource)
) {
  throw new Error(
    "Manage Assessment invariant failed: the 100-word editor and unsaved-change safeguards must remain enabled"
  );
}
if (
  !/kind: "save_activities"[\s\S]{0,240}?period,[\s\S]{0,120}?content: normalized/.test(
    offlineRuntimeSource
  )
) {
  throw new Error(
    "Manage Assessment invariant failed: offline edits must queue the teacher's validated assessment period"
  );
}

/*
 * Item selection: a teacher may keep more than one assessment uses, and picks
 * between the fixed default set and a random draw per assessment. Every
 * catalogue read that belongs to a running assessment must pass that run's
 * code, because the code is the seed - a read without it would hand the teacher
 * or the learner a different set of letters, words and stories mid-assessment.
 */
function liveContentCallArguments(text) {
  const marker = "getLiveAssessmentContent(";
  const definition = text.indexOf(`async function ${marker}`);
  const calls = [];
  let index = text.indexOf(marker, definition + marker.length);

  while (index >= 0) {
    let depth = 1;
    let cursor = index + marker.length;
    while (cursor < text.length && depth > 0) {
      const character = text[cursor];
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      cursor += 1;
    }
    calls.push(text.slice(index + marker.length, cursor - 1));
    index = text.indexOf(marker, cursor);
  }

  return calls;
}

if (
  !/export function selectAssessmentContentForRun/.test(assessmentContentSource) ||
  !/ASSESSMENT_CONTENT_MODES/.test(assessmentContentSource) ||
  !/ASSESSMENT_CONTENT_LIMITS/.test(assessmentContentSource)
) {
  throw new Error(
    "Item selection invariant failed: the fixed/random modes and the saved-pool ceiling must stay defined in one shared module"
  );
}
const liveContentCalls = liveContentCallArguments(routeSource);
if (liveContentCalls.length !== 12) {
  throw new Error(
    `Item selection invariant failed: expected 12 catalogue reads in the assessment route, including scoresheet Story Number correction and the on-demand analytics detail, found ${liveContentCalls.length}`
  );
}
const unseededCalls = liveContentCalls.filter(
  (args) => !/\bcode\b/.test(args) && !/\bseed\b/.test(args)
);
if (unseededCalls.length !== 1 || !/userId[\s\S]*?period/.test(unseededCalls[0])) {
  throw new Error(
    "Item selection invariant failed: every assessment catalogue read must pass the run code as its seed, except the one pre-flight check that runs before a code exists"
  );
}
if (
  !/selectAssessmentContentForRun\(\s*catalogue\.pool,\s*catalogue\.modes,\s*seed,\s*catalogue\.defaults\s*\)/.test(
    routeSource
  ) ||
  !/modes: serializeAssessmentContentMode\(rows\)\[normalizedPeriod\]/.test(routeSource) ||
  !/defaults: serializeAssessmentContentDefaults\(rows\)\[normalizedPeriod\]/.test(
    routeSource
  )
) {
  throw new Error(
    "Item selection invariant failed: the cached catalogue must hold the full pool, the mode and the fixed-default choice, and the draw must happen per assessment"
  );
}
if (
  !/category: \{ not: ASSESSMENT_CONTENT_MODE_CATEGORY \}/.test(routeSource) ||
  !/persistTeacherAssessmentContentMode/.test(routeSource)
) {
  throw new Error(
    "Item selection invariant failed: saving content must preserve the stored item-selection mode"
  );
}
if (
  !/action === "save_content_mode"/.test(assessmentPostBlock) ||
  !/selectedModes = normalizeAssessmentContentModes/.test(teacherPageSource) ||
  !/setActivityPeriodDirty\(activityPeriod, true\)/.test(teacherPageSource) ||
  !/contentModeCard/.test(teacherPageSource)
) {
  throw new Error(
    "Item selection invariant failed: the teacher must be able to choose fixed or random item selection"
  );
}
/*
 * In fixed mode a teacher who saved more than one assessment needs picks which
 * items are administered. The choice is stored with the mode and applied by the
 * shared selector, so it can never change how many items a learner is given.
 */
if (
  !/applyAssessmentContentDefaults/.test(assessmentContentSource) ||
  !/selectAssessmentContentForRun\(value, mode, seed, defaults\)/.test(
    assessmentContentSource
  ) ||
  !/parseAssessmentContentSettings/.test(assessmentContentSource) ||
  !/serializeAssessmentContentSettings/.test(assessmentContentSource)
) {
  throw new Error(
    "Item selection invariant failed: the fixed default choice must be shared by the server and the offline runtime"
  );
}
if (
  !/toggleContentDefault/.test(teacherPageSource) ||
  !/showContentDefaultsColumn/.test(teacherPageSource) ||
  !/contentDefaultToggle/.test(teacherPageSource) ||
  !/Untick one first/.test(teacherPageSource)
) {
  throw new Error(
    "Item selection invariant failed: the teacher must be able to tick which saved items the fixed default uses"
  );
}
if (
  !/selectAssessmentContentForRun\(/.test(offlineRuntimeSource) ||
  !/getOfflineAssessmentContent\(snapshot, period, offlineCode\)/.test(
    offlineRuntimeSource
  ) ||
  !/action === "save_content_mode"/.test(offlineRuntimeSource)
) {
  throw new Error(
    "Item selection invariant failed: an offline assessment must draw the same items as the same code does online"
  );
}
if (
  !/getOfflineContentDefaults\(snapshot, normalizedPeriod\)/.test(offlineRuntimeSource) ||
  !/getOfflineContentDefaults\(snapshot, period\)/.test(offlineRuntimeSource) ||
  !/contentDefaults: nextContentDefaults/.test(offlineRuntimeSource) ||
  !/snapshot\.contentDefaults = payload\.contentDefaults/.test(
    readSource("app", "components", "TeacherOfflinePreload.jsx")
  )
) {
  throw new Error(
    "Item selection invariant failed: the offline runtime must carry the teacher's fixed-default choice too"
  );
}
/*
 * The mode is stored in the content table under a reserved category, which the
 * original category check rejected. Keep the migration that widens it next to
 * the code that depends on it, so a fresh database is provisioned correctly.
 */
const settingsMigration = path.join(
  "prisma",
  "migrations",
  "20261003_allow_assessment_content_settings",
  "migration.sql"
);
if (!fs.existsSync(path.join(process.cwd(), settingsMigration))) {
  throw new Error(
    `Item selection invariant failed: ${settingsMigration} must exist so the stored mode has somewhere to live`
  );
}
if (
  !/ASSESSMENT_CONTENT_MODE_CATEGORY = "settings"/.test(assessmentContentSource) ||
  !/CHECK \(category IN \('letters', 'words', 'stories', 'settings'\)\)/.test(
    readSource(settingsMigration)
  )
) {
  throw new Error(
    "Item selection invariant failed: the reserved mode category and the migration that allows it must agree"
  );
}

/*
 * Story import: a teacher can bring a passage in from their own .txt, .docx or
 * .pdf file, but only after reading it back. The reader must stay lazily loaded
 * so the dashboard does not carry the archive and PDF code, and the overlay
 * must keep all three outcomes - reading, review, and a clear failure.
 */
const storyImportSource = readSource("lib", "storyImport.js");
if (
  !/export async function extractStoryFromFile/.test(storyImportSource) ||
  !/storyImportFormatFor/.test(storyImportSource) ||
  !/JSZip\.loadAsync/.test(storyImportSource) ||
  !/DecompressionStream/.test(storyImportSource)
) {
  throw new Error(
    "Story import invariant failed: txt, docx and pdf passages must all be readable"
  );
}
if (
  !/await import\(\s*"\.\.\/\.\.\/lib\/storyImport"\s*\)/.test(teacherPageSource)
) {
  throw new Error(
    "Story import invariant failed: the file readers must stay lazily loaded so the dashboard does not carry them"
  );
}
if (
  !/handleStoryImportFile/.test(teacherPageSource) ||
  !/saveImportedStory/.test(teacherPageSource) ||
  !/storyImportInputRef\.current\?\.click\(\)/.test(teacherPageSource) ||
  !/accept=\{STORY_IMPORT_FILE_ACCEPT\}/.test(teacherPageSource)
) {
  throw new Error(
    "Story import invariant failed: Manage Assessment must offer a story file picker"
  );
}
if (
  !/Nothing is[\s\S]{0,60}?saved until you press Save Story/i.test(teacherPageSource) ||
  !/storyImportWarnings/.test(teacherPageSource) ||
  !/storyImport\.status === "ready"[\s\S]{0,100}?"Discard"[\s\S]{0,100}?"Cancel"[\s\S]{0,100}?"Close"/.test(
    teacherPageSource
  ) ||
  !/>\s*Save Story\s*</.test(teacherPageSource) ||
  !/disabled=\{!storyImportReady\}/.test(teacherPageSource)
) {
  throw new Error(
    "Story import invariant failed: an imported passage must be reviewed, discardable, and only saveable once it is exactly 100 words"
  );
}
if (
  !/Drop story file here/.test(teacherPageSource) ||
  !/handleStoryImportDrop/.test(teacherPageSource) ||
  !/Importing Story Passage/.test(teacherPageSource)
) {
  throw new Error(
    "Story import invariant failed: Import File must open a drop-zone overlay with a reading state"
  );
}
if (
  !/Story content must contain exactly 100 words/.test(teacherPageSource) ||
  !/Up to \$\{limit\} stories can be saved/.test(teacherPageSource)
) {
  throw new Error(
    "Story import invariant failed: an imported story must obey the same 100-word rule and story ceiling as a hand-written one"
  );
}

/*
 * Excel export: the template ships formulas Excel can only display as an error,
 * and the report must repair them instead of handing the teacher a scoresheet
 * whose legends read "#NAME?" or "#REF!".
 */
const excelExportSource = readSource("lib", "excelExport.js");
if (
  !/repairTemplateFormulas\(zip\)/.test(excelExportSource) ||
  !/NATIVE_EXCEL_FUNCTIONS/.test(excelExportSource) ||
  !/_xludf\\\./.test(excelExportSource) ||
  !/#REF!/.test(excelExportSource)
) {
  throw new Error(
    "Excel export invariant failed: the template's unrecognised function names and deleted-range formulas must be repaired before the workbook ships"
  );
}
if (
  !/PART\s*=\s*\{[\s\S]{0,200}?"G3 FIL Reading Scoresheet": "xl\/worksheets\/sheet1\.xml"/.test(
    excelExportSource
  ) ||
  !/populateSourceScoresheet\(sourceScoresheet, teacher, enrolled\)/.test(
    excelExportSource
  )
) {
  throw new Error(
    "Excel export invariant failed: the Filipino scoresheet is the workbook's source sheet and must be written too"
  );
}
if (
  !/editor\.setCell\("F4", enrolled\.Total\)/.test(excelExportSource) ||
  !/editor\.setCell\("H4", rows\.length\)/.test(excelExportSource)
) {
  throw new Error(
    "Excel export invariant failed: the header totals must be written as values so they are correct before Excel recalculates"
  );
}

/*
 * Assessment Records: the scoresheet is the exported workbook drawn as a grid,
 * so every heading has to sit over the same column the workbook puts it over.
 * The check walks the merged cells exactly as a spreadsheet would and requires
 * the header block to fill all 21 columns of every row without a gap or an
 * overlap; a wrong span would otherwise shift every label silently.
 */
const SCORESHEET_COLUMNS = 21;
const scoresheetHeaderBlock = sourceBlock(
  teacherPageSource,
  '<tr className="ssAssessmentRow">',
  '<tr className="ssColumnRow">'
);
const scoresheetColumnRow =
  sourceBlock(
    teacherPageSource,
    '<tr className="ssColumnRow">',
    "</tr>"
  ) + "</tr>";
const scoresheetHeaderRows = (
  `${scoresheetHeaderBlock}${scoresheetColumnRow}`
).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];

if (scoresheetHeaderRows.length !== 8) {
  throw new Error(
    `Assessment Records invariant failed: the on-screen scoresheet must keep its eight data-header rows after removing the branding rows, found ${scoresheetHeaderRows.length}`
  );
}

const scoresheetFilled = new Set();
let scoresheetOverflow = "";
scoresheetHeaderRows.forEach((rowXml, rowIndex) => {
  const cells = rowXml.match(/<(?:th|td)\b[^>]*>/g) || [];
  let column = 0;

  for (const cell of cells) {
    while (scoresheetFilled.has(`${rowIndex}:${column}`)) column += 1;
    const span = Number((/colSpan=\{(\d+)\}/.exec(cell) || [])[1] || 1);
    const rows = Number((/rowSpan=\{(\d+)\}/.exec(cell) || [])[1] || 1);

    if (column + span > SCORESHEET_COLUMNS) {
      scoresheetOverflow = `row ${rowIndex + 1} runs past column ${SCORESHEET_COLUMNS}`;
      return;
    }

    for (let r = rowIndex; r < rowIndex + rows; r += 1) {
      for (let c = column; c < column + span; c += 1) {
        scoresheetFilled.add(`${r}:${c}`);
      }
    }

    column += span;
  }
});

if (scoresheetOverflow) {
  throw new Error(`Assessment Records invariant failed: ${scoresheetOverflow}`);
}

for (let rowIndex = 0; rowIndex < scoresheetHeaderRows.length; rowIndex += 1) {
  for (let column = 0; column < SCORESHEET_COLUMNS; column += 1) {
    if (!scoresheetFilled.has(`${rowIndex}:${column}`)) {
      throw new Error(
        `Assessment Records invariant failed: the scoresheet header row ${rowIndex + 1} leaves column ${column + 1} uncovered`
      );
    }
  }
}

/*
 * The Class Record table has record rows too, so the scoresheet's own row is
 * located after the scoresheet grid begins.
 */
const scoresheetGridStart = teacherPageSource.indexOf(
  'className="scoresheetGrid"'
);
const scoresheetBodyStart =
  scoresheetGridStart < 0
    ? -1
    : teacherPageSource.indexOf("<tr key={assessment.id}>", scoresheetGridStart);
const scoresheetBodyRow =
  scoresheetBodyStart < 0
    ? ""
    : teacherPageSource.slice(
        scoresheetBodyStart,
        teacherPageSource.indexOf("</tr>", scoresheetBodyStart)
      );
const scoresheetBodyCells = (scoresheetBodyRow.match(/<td\b/g) || []).length;
if (scoresheetBodyCells !== SCORESHEET_COLUMNS) {
  throw new Error(
    `Assessment Records invariant failed: the scoresheet header covers ${SCORESHEET_COLUMNS} columns but each record row has ${scoresheetBodyCells} cells`
  );
}

if (
  !/hostSessions:\s*\{[\s\S]{0,500}?storyTitle:\s*true/.test(routeSource) ||
  !/story_number:\s*storyNumber/.test(routeSource) ||
  !/scoresheetValue\([\s\S]*?assessment,[\s\S]*?"experience_rating"/.test(
    scoresheetBodyRow
  )
) {
  throw new Error(
    "Assessment Records invariant failed: Story Number and Learner Experience must be read from persisted assessment data"
  );
}

if (
  /localStorage\.setItem\(\s*`crla_assessment_draft_v1:/.test(
    teacherPageSource
  ) ||
  !/Are you sure you want to delete this item\?/.test(teacherPageSource) ||
  !/The item is removed from this draft only/.test(teacherPageSource)
) {
  throw new Error(
    "Manage Assessment invariant failed: unsaved item changes must remain temporary and deletion must be confirmed"
  );
}

/* Labels wrap across source lines, so compare against flattened whitespace. */
const scoresheetLabels = teacherPageSource.replace(/\s+/g, " ");
for (const label of [
  "ASSESSMENT TYPE",
  "School ID:",
  "Total Enrolment",
  "Assessed :",
  "School Name:",
  "Teacher:",
  "Grade:",
  "Section:",
  "Language:",
  "Assessment Part 1 (Word Recognition)",
  "Assessment Part 2 (Reading Fluency and Comprehension)",
  "WORD SCORE 0 - Full Refresher",
  "Total Time Used in Reading (Max : 2 Mins)",
  "Number of Words per Minute (WPM)",
  "READING PROFILE",
  "Remarks",
]) {
  if (!scoresheetLabels.includes(label)) {
    throw new Error(
      `Assessment Records invariant failed: the scoresheet is missing the workbook label "${label}"`
    );
  }
}

if (
  !/className="ssTimeHeaderLayout"[\s\S]{0,180}?<span>Total<\/span>[\s\S]{0,180}?<span>Mins<\/span>[\s\S]{0,180}?<span>Secs<\/span>/.test(
    teacherPageSource
  )
) {
  throw new Error(
    "Assessment Records invariant failed: Total, Mins and Secs must keep the workbook's two-tier header"
  );
}

if (
  !/className="scoresheetControls"/.test(teacherPageSource) ||
  !/View Mode/.test(teacherPageSource) ||
  !/Edit Mode/.test(teacherPageSource) ||
  !/action === "save_assessment_records"/.test(routeSource) ||
  !/action === "save_assessment_records"/.test(offlineRuntimeSource) ||
  !/scoresheetSavePromptOpen/.test(teacherPageSource)
) {
  throw new Error(
    "Assessment Records invariant failed: scoresheet editing must be explicit, guarded against unsaved navigation, and persist online or offline"
  );
}

if (
  /scoresheet-brand\.png|scoresheet-partners\.png|CRLA3v3/.test(
    scoresheetHeaderBlock
  ) ||
  !/className="ssReference"/.test(scoresheetHeaderBlock) ||
  !/colSpan=\{6\}/.test(scoresheetHeaderBlock)
) {
  throw new Error(
    "Assessment Records invariant failed: the on-screen branding must be removed and the reading-level reference must fill the remaining header width"
  );
}

if (
  !/values: index < 0 \? \[""\]/.test(teacherPageSource) ||
  !/Add another item/.test(teacherPageSource) ||
  !/next\[activityPeriod\]\[category\]\.push\(\.\.\.normalizedValues\)/.test(
    teacherPageSource
  )
) {
  throw new Error(
    "Manage Assessment invariant failed: Add Item must support multiple letter or word entries in one draft"
  );
}

if (
  !/\.heroIntro\s*\{[\s\S]{0,160}?width:\s*auto;[\s\S]{0,160}?max-width:\s*570px;/.test(
    landingCssSource
  ) ||
  !/\.backToTop\s*\{[\s\S]{0,260}?bottom:\s*max\(104px/.test(
    landingCssSource
  )
) {
  throw new Error(
    "Landing invariant failed: tablet intro copy and the desktop back-to-top control must stay clear of their neighboring rules and footer"
  );
}

const classSummaryBlock = sourceBlock(
  teacherPageSource,
  'className="classSummaryTable classSummaryTopTable"',
  '<div className="summaryMetricGrid">'
);

if (
  (classSummaryBlock.match(/className="classSummaryTable/g) || []).length !== 2 ||
  !/classSummaryTitleRow[\s\S]*?colSpan=\{15\}[\s\S]*?Percent \(%\) of Learners at Each Proficiency Level/.test(
    classSummaryBlock
  ) ||
  !/Assessment Part 1 Reading Level[\s\S]*?Average Score[\s\S]*?READING PROFILE/.test(
    classSummaryBlock
  ) ||
  !/row\.part1Counts\.map/.test(classSummaryBlock) ||
  !/row\.profileCounts\.map/.test(classSummaryBlock) ||
  /Filipino/.test(classSummaryBlock)
) {
  throw new Error(
    "Class Summary invariant failed: the app must render the workbook's two English-only tables with their merged heading groups and count cells"
  );
}

if (
  !/const passageRows = rows\.filter\([\s\S]{0,180}?hasRecordedPassageAssessment/.test(
    teacherPageSource
  ) ||
  !/classSummaryAverage\([\s\S]{0,180}?passageRows\.map/.test(
    teacherPageSource
  ) ||
  !/\.recordSummary \.summaryTableWrap,[\s\S]{0,220}?overflow-x: auto !important;[\s\S]{0,100}?overflow-y: hidden !important;/.test(
    teacherPageSource
  ) ||
  !/@media \(max-width: 900px\)[\s\S]{0,500}?touch-action: pan-x pan-y;/.test(
    teacherPageSource.slice(teacherPageSource.indexOf("CLASS SUMMARY WORKBOOK VIEW"))
  )
) {
  throw new Error(
    "Class Summary invariant failed: passage averages must ignore unadministered Part 2 rows and both workbook tables must scroll sideways without nested vertical scrolling"
  );
}

const classRecordBlock = sourceBlock(
  teacherPageSource,
  'className="recordTemplateTable classRecordTable classRecordWorkbookTable"',
  '<div className="scoresheetView">'
);

if (
  !/classRecordWorkbookMetaRow[\s\S]*?School[\s\S]*?Teacher[\s\S]*?Grade Level/.test(classRecordBlock) ||
  !/classRecordEnglishBand[\s\S]*?English/.test(classRecordBlock) ||
  !/Assessment Part 1[\s\S]*?Assessment Part 2[\s\S]*?READING PROFILE/.test(classRecordBlock) ||
  !/Math\.round\(\(total \/ 20\) \* 100\)/.test(classRecordBlock) ||
  /Filipino/i.test(classRecordBlock)
) {
  throw new Error(
    "Class Record invariant failed: the app must keep the workbook-aligned English-only grid and calculated percentage columns"
  );
}

const analyticsBlock = sourceBlock(
  teacherPageSource,
  '{activeTab ===\n                "analytics"',
  '{activeTab ===\n                "profile"'
);

if (
  !/ReadingProfileProgressChart/.test(analyticsBlock) ||
  !/AnalyticsLearnerResultPanel/.test(analyticsBlock) ||
  !/LearnerAssessmentEvidence/.test(teacherPageSource) ||
  !/analyticsLearnerDirectory/.test(analyticsBlock) ||
  !/analyticsLearnerSearch/.test(analyticsBlock) ||
  !/analyticsLearnerSort/.test(analyticsBlock) ||
  !/analyticsVisibleLearners\.map/.test(analyticsBlock) ||
  /<h3>\s*Records\s*<\/h3>/.test(analyticsBlock) ||
  /<h3>\s*Completed\s*<\/h3>/.test(analyticsBlock) ||
  !/action === "get_assessment_detail"/.test(routeSource) ||
  !/"get_assessment_detail"/.test(offlineRuntimeSource) ||
  !/analyticsDetailsById/.test(teacherPageSource) ||
  !/const visiblePeriods = focus/.test(teacherPageSource) ||
  !/event\.stopPropagation\(\)/.test(teacherPageSource) ||
  /className="analyticsChartFocus"/.test(teacherPageSource) ||
  !/className="analytics2dBar"/.test(teacherPageSource) ||
  /analytics3d/.test(teacherPageSource) ||
  !/analyticsMiscueLedger/.test(teacherPageSource) ||
  !/formatAnalyticsMiscueType/.test(teacherPageSource) ||
  !/Last word read/.test(teacherPageSource) ||
  /panelHeaderTitle">Analytics/.test(analyticsBlock) ||
  !/words_read: analyticsPassageMetrics\.wordsRead/.test(routeSource) ||
  !/analyticsMobileResultOverlay/.test(teacherPageSource) ||
  !/createPortal/.test(teacherPageSource) ||
  !/matchMedia\("\(max-width: 760px\)"\)/.test(teacherPageSource) ||
  !/\(analyticsMobileView && analyticsMobileResultOpen\) \|\| Boolean\(analyticsChartOverlayPeriod\)/.test(teacherPageSource) ||
  // Every viewport that can lock scrolling for a chart must also render its dialog.
  !/\{analyticsChartOverlayPeriod && typeof document !== "undefined"\s*\? createPortal\(\s*<AnalyticsPeriodChartDialog/.test(teacherPageSource) ||
  !/analyticsMobileChartStack/.test(teacherPageSource) ||
  !/analyticsChartOverlay/.test(teacherPageSource) ||
  !/Press a period chart to enlarge\./.test(teacherPageSource) ||
  !/AnalyticsComparisonPanel/.test(analyticsBlock) ||
  !/grid-template-columns: 42px minmax\(0, 1fr\);[\s\S]{0,80}?gap: 16px;/.test(teacherPageSource)
) {
  throw new Error(
    "Analytics invariant failed: learner evidence, stacked mobile charts, chart overlays, comparisons, and axis spacing must remain intact"
  );
}

if (
  !/body\.style\.position = "fixed"/.test(teacherPageSource) ||
  !/body\.style\.top = `-\$\{scrollY\}px`/.test(teacherPageSource) ||
  !/window\.scrollTo\(scrollX, scrollY\)/.test(teacherPageSource) ||
  !/startingAssessment && typeof document !== "undefined"[\s\S]{0,100}?createPortal\(/.test(teacherPageSource)
) {
  throw new Error("Starting Assessment invariant failed: modal must lock and restore page scroll outside animated shell");
}

if (
  !/aria-label=\{`Why this result is \$\{readingProfile\}`\}/.test(source) ||
  !/getReadingProfileExplanation/.test(source)
) {
  throw new Error(
    "Final result invariant failed: Reading Profile must keep its accessible criteria explanation"
  );
}

/*
 * Records readability: the shared deep-table reset paints even rows
 * transparent with a specificity the workbook shades cannot beat, which
 * stripped the English band and the reading-profile colours from every second
 * learner and restored them only while the pointer was over the row. The
 * shades therefore travel in a variable that no competing rule overrides, and
 * each record table paints the hovered state with the same value so a cell
 * never changes under the pointer.
 */
for (const variable of [
  "--class-record-cell",
  "--class-record-ink",
  "--scoresheet-cell",
]) {
  if (!teacherPageSource.includes(variable)) {
    throw new Error(
      `Assessment Records invariant failed: ${variable} must carry the workbook shade so no later rule can strip it`
    );
  }
}
if (
  !/background: var\(--class-record-cell, #fffef9\) !important/.test(teacherPageSource) ||
  !/color: var\(--class-record-ink, #111820\) !important/.test(teacherPageSource) ||
  !/\.recordTemplateTable\.classRecordWorkbookTable tbody tr:nth-child\(even\) td/.test(
    teacherPageSource
  )
) {
  throw new Error(
    "Assessment Records invariant failed: every class-record row, even rows included, must paint its own shade"
  );
}
if (
  !/\.recordsMainPanel \.scoresheetGrid tbody tr:hover td[\s\S]{0,200}?background: var\(--scoresheet-cell, #ffffff\) !important/.test(
    teacherPageSource
  )
) {
  throw new Error(
    "Assessment Records invariant failed: the scoresheet must keep each cell's fill while the pointer is over it"
  );
}
/*
 * Records tables scroll sideways only. A viewport height turned each of them
 * into a vertical scroll container whose contained overscroll swallowed a
 * vertical swipe, so on a phone the end of the record could only be reached by
 * dragging in the narrow margin beside the table.
 */
if (/max-height: calc\(100dvh[^)]*\)[\s\S]{0,120}?\.scoresheetScroller/.test(teacherPageSource)) {
  throw new Error(
    "Assessment Records invariant failed: the scoresheet must not be given a viewport height"
  );
}
const recordsScrollerBlock = sourceBlock(
  teacherPageSource,
  ".summaryTableWrap,\n        .summaryDetailScroller,\n        .recordTemplateScroller,\n        .scoresheetScroller {",
  "}"
);
if (
  !/max-height: none !important/.test(recordsScrollerBlock) ||
  !/overflow-x: auto !important/.test(recordsScrollerBlock) ||
  !/overflow-y: hidden !important/.test(recordsScrollerBlock) ||
  !/overscroll-behavior-y: auto/.test(recordsScrollerBlock)
) {
  throw new Error(
    "Assessment Records invariant failed: the record tables must scroll sideways only and leave vertical swipes to the page"
  );
}
if (
  /overscroll-behavior: contain/.test(recordsScrollerBlock) ||
  /overflow: auto !important/.test(recordsScrollerBlock)
) {
  throw new Error(
    "Assessment Records invariant failed: containing overscroll on both axes traps vertical swipes on the record tables"
  );
}

console.log(
  "Verified assessment invariants: CRLA scoring, two-second restraints, passage sequencing, logout, offline records, and ordered cloud synchronization are enforced."
);
