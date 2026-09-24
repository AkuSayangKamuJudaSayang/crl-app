"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ConnectionHealthPanel from "../../../components/ConnectionHealthPanel";
import {
  getAssessmentState,
  getMutations,
  putMutation,
  removeAssessmentState,
  removeMutation,
  saveAssessmentState,
} from "../../../lib/assessmentOutbox";
import {
  createAssessmentChannel,
  closeAssessmentChannel,
  createAssessmentRealtimeChannel,
  getAssessmentWordGateKey,
  getAssessmentPassageGateKey,
  publishAssessmentState,
  publishAssessmentRealtimeState,
  warmAssessmentPublisher,
  warmAssessmentRealtime,
} from "../../../lib/assessmentChannel";

let LETTERS = [
  "M",
  "S",
  "A",
  "L",
  "O",
  "B",
  "E",
  "U",
  "R",
  "T",
];

let WORDS = [
  "clap",
  "jump",
  "eat",
  "drink",
  "stand",
  "dance",
  "fly",
  "pencil",
  "basket",
  "helmet",
];

let STORIES = [
  {
    id: 1,
    title: "Para The Parrot",
    description: "A story about a parrot flying to the market.",
    available: true,
  },
  {
    id: 2,
    title: "A Day In The Fields",
    description: "Join the farmers as they work in the terraces.",
    available: true,
  },
];

async function fetchWithTimeout(input, init = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/*
 * Host advances are compare-and-set: each one carries the item the server is
 * expected to still be on. Firing them concurrently let a later advance reach
 * the server before an earlier one had committed, so its expectation no longer
 * matched, the server rejected it as stale, and the client silently ignored
 * that reply. The server then stayed stuck on an old item while the teacher
 * moved on, and the learner - which polls the server - never advanced.
 *
 * Run them strictly in order so each expectation still holds. Answers are at
 * least two seconds apart and one advance takes a few hundred milliseconds,
 * so this costs nothing in practice.
 */
let hostAdvanceChain = Promise.resolve();

/*
 * How long Start Reading waits for the learner device to confirm that the whole
 * passage is laid out. The learner pre-renders as soon as the passage state
 * arrives, so this is normally already satisfied; the timeout is a safety net
 * for a lost control packet, never the expected path.
 */
const PASSAGE_RENDER_WAIT_MS = 3500;

function sendHostAdvanceSerialized(body) {
  const next = hostAdvanceChain
    .catch(() => null)
    .then(() =>
      fetchWithTimeout("/api/assessment?action=host_advance", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          action: "host_advance",
          ...body,
        }),
      })
    );

  hostAdvanceChain = next.catch(() => null);
  return next;
}

const PASSAGE_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

const FIELD_PASSAGE_TEXT =
  "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.";

const STORY_QUESTIONS = {
  para: [
    { index: 0, text: "What must Para look for?" },
    { index: 1, text: "What time or part of the day is it?" },
    { index: 2, text: "What does Para land on?" },
    { index: 3, text: "Who does Para see?" },
    { index: 4, text: "What else is the police officer doing besides directing traffic?" },
    { index: 5, text: "What could the police officer be feeling?" },
  ],
  fields: [
    { index: 0, text: "What is the job of Dulnuwan?" },
    { index: 1, text: "When do Ali and Dina help Dulnuwan and Bugan?" },
    { index: 2, text: "Where do they rest?" },
    { index: 3, text: "Why do they rest?" },
    { index: 4, text: "What kind of weather or day is it?" },
    { index: 5, text: "What does Dulnuwan pick up?" },
  ],
};

const QUESTIONS = STORY_QUESTIONS.para;

const EXPERIENCE_RATING_CHOICES = [
  { rating: 1, emoji: "😡", label: "Very difficult" },
  { rating: 2, emoji: "😞", label: "Difficult" },
  { rating: 3, emoji: "😐", label: "Neutral" },
  { rating: 4, emoji: "🙂", label: "Good" },
  { rating: 5, emoji: "😄", label: "Very good" },
];

function getComprehensionQuestions(session) {
  const title = String(session?.story_title ?? session?.storyTitle ?? "")
    .trim()
    .toLowerCase();
  return title.includes("a day in the fields")
    ? STORY_QUESTIONS.fields
    : STORY_QUESTIONS.para;
}

function getScoresheetReadingProfile(totalPart1Score, readingPercentage, comprehensionScore) {
  const total = Number(totalPart1Score || 0);
  const accuracy = Number(readingPercentage || 0);
  const comprehension = Number(comprehensionScore || 0);

  if (total <= 10) return "Low Emerging Reader";
  if (accuracy <= 25) return "High Emerging Reader";
  if (accuracy <= 50) return comprehension === 0 ? "High Emerging Reader" : "Developing Reader";
  if (accuracy <= 75) return comprehension <= 2 ? "Developing Reader" : "Transitioning Reader";
  return comprehension <= 4 ? "Transitioning Reader" : "Reading At Grade Level";
}

function getScoresheetStoryNumber(title) {
  const normalized = String(title || "").trim().toLowerCase();
  if (normalized === "para the parrot") return 1;
  if (normalized === "a day in the fields") return 2;
  return null;
}

/*
 * Comprehension answers are the only assessment responses that had no durable
 * teacher journal. Part 1 got one precisely because a lagging background write
 * could lower an already-recorded score; comprehension kept trusting whatever
 * the last server snapshot said, which is how a marked-correct answer could be
 * reported as 0/6 in the final review.
 *
 * These helpers give comprehension the same monotonic guarantee: every answer
 * the teacher taps is merged into a local journal, and a later source (the
 * journal) always wins over an earlier one (a server snapshot), while a source
 * that simply has no flag for an index can never erase a recorded flag.
 */
function mergeComprehensionResults(...resultGroups) {
  const byIndex = new Map();

  for (const group of resultGroups) {
    if (!Array.isArray(group)) continue;

    for (const item of group) {
      const questionIndex = Number(item?.questionIndex ?? item?.question_index);
      if (!Number.isInteger(questionIndex) || questionIndex < 0) continue;

      const explicit = item?.isCorrect ?? item?.is_correct;

      if (typeof explicit === "boolean") {
        byIndex.set(questionIndex, { questionIndex, isCorrect: explicit });
        continue;
      }

      if (!byIndex.has(questionIndex)) {
        byIndex.set(questionIndex, { questionIndex, isCorrect: null });
      }
    }
  }

  return Array.from(byIndex.values()).sort(
    (left, right) => left.questionIndex - right.questionIndex
  );
}

function normalizeComprehensionResult(result) {
  const questionIndex = Number(result?.questionIndex ?? result?.question_index);
  if (!Number.isInteger(questionIndex) || questionIndex < 0) return null;

  const explicit = result?.isCorrect ?? result?.is_correct;

  return {
    questionIndex,
    isCorrect: typeof explicit === "boolean" ? explicit : null,
  };
}

function countCorrectComprehension(results) {
  return (Array.isArray(results) ? results : []).filter(
    (item) => item?.isCorrect === true
  ).length;
}

function recordReviewTaskResult(session, field, result) {
  const previous = Array.isArray(session?.[field]) ? session[field] : [];
  const next = previous.filter((item) => Number(item.index) !== Number(result.index));
  next.push(result);
  next.sort((left, right) => Number(left.index) - Number(right.index));

  return {
    ...(session || {}),
    [field]: next,
  };
}

function mergeReviewTaskResults(...resultGroups) {
  const resultsByIndex = new Map();

  resultGroups.forEach((results) => {
    if (!Array.isArray(results)) return;

    results.forEach((result) => {
      const index = Number(result?.index);
      if (!Number.isInteger(index) || typeof result?.isCorrect !== "boolean") {
        return;
      }

      resultsByIndex.set(index, {
        ...result,
        index,
        isCorrect: result.isCorrect,
      });
    });
  });

  return Array.from(resultsByIndex.values()).sort(
    (left, right) => Number(left.index) - Number(right.index)
  );
}

function getReadingProfileTone(profile) {
  if (profile === "Low Emerging Reader") return { background: "#f8eae8", border: "#ebc9c4", color: "#9b2e22" };
  if (profile === "High Emerging Reader") return { background: "#f5ede0", border: "#e6cd98", color: "#835b24" };
  if (profile === "Developing Reader") return { background: "#f5ede0", border: "#e3d3a0", color: "#9b2e22" };
  if (profile === "Transitioning Reader") return { background: "#edf1f7", border: "#98a2b3", color: "#1a2b4c" };
  return { background: "#e8f0ea", border: "#d7e6dd", color: "#2f5f49" };
}

const TEACHER_STAGE_ORDER = {
  waiting: 0,
  connected: 0,
  letter: 10,
  word: 20,
  story_choice: 30,
  passage: 40,
  passage_paused: 40,
  comprehension: 50,
  learner_experience: 60,
  teacher_review: 70,
  terminated: 80,
  completed: 90,
  ended: 100,
};

function isTeacherStageRegression(incomingStage, currentStage) {
  return (
    (TEACHER_STAGE_ORDER[String(incomingStage || "waiting")] ?? 0) <
    (TEACHER_STAGE_ORDER[String(currentStage || "waiting")] ?? 0)
  );
}

function mergeMonotonicTeacherSession(current, incoming) {
  if (!incoming || typeof incoming !== "object") return current;
  if (!current || typeof current !== "object") return incoming;

  const currentStage = String(current.stage || "waiting");
  const incomingStage = String(incoming.stage || currentStage);
  if (isTeacherStageRegression(incomingStage, currentStage)) return current;

  const currentContent = String(
    current.current_content ?? current.currentContent ?? ""
  );
  const incomingContent = String(
    incoming.current_content ?? incoming.currentContent ?? currentContent
  );

  if (incomingStage === currentStage && ["letter", "word"].includes(currentStage)) {
    const items = currentStage === "letter" ? LETTERS : WORDS;
    const currentIndex = items.indexOf(currentContent);
    const incomingIndex = items.indexOf(incomingContent);
    if (
      currentIndex >= 0 &&
      incomingIndex >= 0 &&
      incomingIndex < currentIndex
    ) {
      return current;
    }
  }

  if (incomingStage === currentStage && currentStage === "comprehension") {
    const questions = getComprehensionQuestions(current);
    const currentIndex = questions.findIndex(
      (question) => question.text === currentContent
    );
    const incomingIndex = questions.findIndex(
      (question) => question.text === incomingContent
    );
    if (
      currentIndex >= 0 &&
      incomingIndex >= 0 &&
      incomingIndex < currentIndex
    ) {
      return current;
    }
  }

  const next = { ...current, ...incoming };

  // Once Start Reading has been accepted locally, a delayed passage snapshot
  // may confirm or advance that clock, but it must never erase it and expose
  // Start Reading again.
  if (currentStage === "passage" && incomingStage === "passage") {
    const startedAt =
      incoming.passage_started_at ||
      incoming.passageStartedAt ||
      current.passage_started_at ||
      current.passageStartedAt ||
      null;
    if (startedAt) {
      next.passage_started_at = startedAt;
      next.passageStartedAt = startedAt;
    }
  }

  return next;
}

function applyLiveAssessmentContent(session) {
  const content = session?.assessment_content;
  if (!content) return false;
  if (Array.isArray(content.letters) && content.letters.length) {
    LETTERS = content.letters.map((value) => String(value));
  }
  if (Array.isArray(content.words) && content.words.length) {
    WORDS = content.words.map((value) => String(value));
  }
  if (Array.isArray(content.stories) && content.stories.length) {
    STORIES = content.stories.map((story, index) => ({
      id: Number(story?.id ?? index + 1),
      title: String(story?.title || `Story ${index + 1}`),
      description: String(story?.description || "Story passage from Manage Assessment."),
      text: String(story?.text || ""),
      available: Boolean(String(story?.text || "").trim()),
    }));
  }
  return true;
}


function crlIsStoryPlaceholder(value) {
  const text = String(value || "").trim();
  return !text || /choose\s+a\s+story\s+passage|teacher\s+will\s+select\s+it/i.test(text);
}

export default function TeacherAssessmentPage({
  initialCode = "",
  initialLearnerId = "",
  initialPeriod = "BoSY",
}) {
  const code =
    String(initialCode || "").trim();

  const learnerId =
    String(initialLearnerId || "").trim();

  const period =
    String(initialPeriod || "BoSY").trim() ||
    "BoSY";

  const learnerDisplayNameRef = useRef("");
  const [stableLearnerDisplayName, setStableLearnerDisplayName] = useState("");

  const [
    session,
    setSession,
  ] = useState(null);
  const [, setAssessmentContentVersion] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    confirmEndSession,
    setConfirmEndSession,
  ] = useState(false);

  const [
    confirmFinishReading,
    setConfirmFinishReading,
  ] = useState(false);

  const [
    showTerminationObservation,
    setShowTerminationObservation,
  ] = useState(false);

  const [
    terminationRemarks,
    setTerminationRemarks,
  ] = useState("");

  const [
    savingTerminationObservation,
    setSavingTerminationObservation,
  ] = useState(false);

  const [finalObservationLevel, setFinalObservationLevel] = useState("");
  const [showExactMiscues, setShowExactMiscues] = useState(false);
  const [selectedExperienceRating, setSelectedExperienceRating] =
    useState(null);
  const [savingExperienceRating, setSavingExperienceRating] =
    useState(false);

  const [
    terminationObservationError,
    setTerminationObservationError,
  ] = useState("");

  const terminationObservationHandledRef =
    useRef(false);

  const assessmentSaveLockRef =
    useRef(false);

  // Synchronous final-review guard. Unlike React state, this is visible to
  // repeated click handlers immediately and guarantees one request per press.
  const finalReviewSaveInFlightRef =
    useRef(false);

  /*
   * Same guarantee for the learner experience rating. The server moves the host
   * to teacher_review on the first accepted submission, so a duplicate request
   * is rejected by its stage guard; without a synchronous guard here a double
   * tap reported a failure for a rating that had already been saved.
   */
  const experienceRatingInFlightRef = useRef(false);

  const openAssessmentSaveModal = useCallback(
    (nextSession = null) => {
      assessmentSaveLockRef.current = true;
      const current =
        nextSession ||
        latestSessionRef.current ||
        session;
      setTerminationRemarks(current?.metrics?.remarks || "");
      setFinalObservationLevel(
        current?.metrics?.observationLevel != null
          ? String(current.metrics.observationLevel)
          : ""
      );
      setShowExactMiscues(false);
      setTerminationObservationError("");
      setShowTerminationObservation(true);
    },
    [session]
  );

  useEffect(() => {
    if (
      session?.stage === "terminated" &&
      session?.current_content === "ZERO_SCORE_PART1_TASK1" &&
      !showTerminationObservation &&
      !savingTerminationObservation
    ) {
      terminationObservationHandledRef.current = true;
      openAssessmentSaveModal(session);
    }
  }, [openAssessmentSaveModal, savingTerminationObservation, session, showTerminationObservation]);

  const [
    activeStage,
    setActiveStage,
  ] = useState(
    "waiting"
  );

  const [
    letterIndex,
    setLetterIndex,
  ] = useState(0);

  const [
    wordIndex,
    setWordIndex,
  ] = useState(0);

  const [
    questionIndex,
    setQuestionIndex,
  ] = useState(0);

  const questionIndexRef = useRef(0);

  useEffect(() => {
    questionIndexRef.current = questionIndex;
  }, [questionIndex]);

  const [
    passageSeconds,
    setPassageSeconds,
  ] = useState(0);

  const [
    passageWordsRead,
    setPassageWordsRead,
  ] = useState(0);

  const [
    miscueType,
    setMiscueType,
  ] = useState("Substitution");

  const [
    miscueWordIndex,
    setMiscueWordIndex,
  ] = useState(1);

  const [
    misreadWord,
    setMisreadWord,
  ] = useState("");

  const [storySelecting, setStorySelecting] = useState(false);
  const [passageStageConfirmed, setPassageStageConfirmed] = useState(false);
  const [startingPassageReading, setStartingPassageReading] = useState(false);
  /*
   * True while Start Reading is waiting for the learner device to confirm the
   * passage is fully on screen. Surfaced in the button label so the teacher
   * knows the clock has not started yet.
   */
  const [waitingForLearnerPassage, setWaitingForLearnerPassage] = useState(false);
  const [passagePaused, setPassagePaused] = useState(false);
  const [timeUpSelecting, setTimeUpSelecting] = useState(false);
  const [timeUpReviewConfirmed, setTimeUpReviewConfirmed] =
    useState(false);
  const [miscueDrawerOpen, setMiscueDrawerOpen] = useState(false);
  const [miscueReviewMode, setMiscueReviewMode] = useState(false);
  const [selectedPassageWord, setSelectedPassageWord] = useState(null);
  const [passageMiscues, setPassageMiscues] = useState([]);
  const [selectedMiscueType, setSelectedMiscueType] = useState(null);
  const [substitutionInputRequested, setSubstitutionInputRequested] =
    useState(false);
  const [reversionSelecting, setReversionSelecting] = useState(false);
  const [reversionSourceWord, setReversionSourceWord] = useState(null);
  const [timeUpSelectedWord, setTimeUpSelectedWord] = useState(null);
  const passageTimerRequestRef = useRef(false);
  const finalLetterSavePromiseRef = useRef(Promise.resolve(null));
  const finalWordSavePromiseRef = useRef(Promise.resolve(null));

  /*
   * Learner passage-render gate.
   *
   * `learnerPassageRenderedKeysRef` records gate keys the learner has confirmed
   * as fully laid out, so a confirmation that arrives before the teacher
   * presses Start Reading is not lost. `learnerPassageWaitRef` holds the single
   * in-flight waiter (Start Reading is single-flight).
   */
  const learnerPassageRenderedKeysRef = useRef(new Set());
  const learnerPassageWaitRef = useRef(null);

  const markLearnerPassageRendered = useCallback((gateKey) => {
    if (!gateKey) return;

    learnerPassageRenderedKeysRef.current.add(gateKey);

    const pending = learnerPassageWaitRef.current;
    if (pending && pending.key === gateKey) {
      learnerPassageWaitRef.current = null;
      pending.resolve(true);
    }
  }, []);

  const waitForLearnerPassage = useCallback((gateKey, timeoutMs) => {
    if (!gateKey) return Promise.resolve(false);
    if (learnerPassageRenderedKeysRef.current.has(gateKey)) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        if (learnerPassageWaitRef.current?.timer === timer) {
          learnerPassageWaitRef.current = null;
        }
        resolve(false);
      }, timeoutMs);

      learnerPassageWaitRef.current = {
        key: gateKey,
        timer,
        resolve: (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
      };
    });
  }, []);

  /*
   * Host advances are compare-and-set against the item the server is expected to
   * still be on. If a single advance is ever lost, every later advance fails
   * that comparison, the stale reply is ignored, and the learner - which reads
   * the server - stays parked on the old item while the teacher keeps moving.
   * That is what makes the first few items feel instant and everything after a
   * lost advance feel stuck.
   *
   * This re-issues the teacher's current item using the server's ACTUAL state as
   * the expectation, so one lost advance can never stall the rest of the
   * assessment. It runs once per stale reply and never recurses.
   */
  const healStaleHostAdvance = useCallback(
    async (serverSession) => {
      const latest = latestSessionRef.current;
      if (!latest || !serverSession) return false;

      const serverStage = String(serverSession.stage || "");
      if (["ended", "completed", "terminated"].includes(serverStage)) {
        return false;
      }

      const desiredStage = String(latest.stage || "");
      if (
        !desiredStage ||
        ["ended", "completed", "terminated"].includes(desiredStage)
      ) {
        return false;
      }

      const desiredContent = String(
        latest.current_content ?? latest.currentContent ?? ""
      );
      if (!desiredContent) return false;

      try {
        const response = await sendHostAdvanceSerialized({
          code,
          stage: desiredStage,
          currentContent: desiredContent,
          storyTitle: String(latest.story_title ?? latest.storyTitle ?? ""),
          item_index: Number(latest.item_index ?? latest.itemIndex ?? 0),
          expected_stage: serverStage,
          expected_current_content: String(
            serverSession.current_content ??
              serverSession.currentContent ??
              ""
          ),
        });

        return response.ok;
      } catch {
        return false;
      }
    },
    [code]
  );

  const [
    recordingMiscue,
    setRecordingMiscue,
  ] = useState(false);

  const [
    answerLockKey,
    setAnswerLockKey,
  ] = useState("");

  // Synchronous guard for answer buttons. React state updates are async, so
  // this ref closes the small race where rapid double-clicks could otherwise
  // enter the same answer handler before answerLockKey re-renders.
  const answerActionLockRef =
    useRef("");

  const [
    transitionPending,
    setTransitionPending,
  ] = useState(false);

  // A single deterministic restraint protects every scored item. The key
  // changes exactly once when a new Letter, Word, or Comprehension item is
  // shown, so polling/realtime refreshes cannot restart the two-second delay.
  const [releasedAnswerRestraintKey, setReleasedAnswerRestraintKey] =
    useState("");
  const answerRestraintTimerRef = useRef(null);

  // Restrain the first Word Recognition answer controls while the learner
  // completes the mandatory Letter Sounds -> Word Recognition loading gate.
  const [
    ,
    setWordInitialTransitionPending,
  ] = useState(false);

  const wordInitialTransitionGateKeyRef = useRef("");
  const learnerWordReadyKeysRef = useRef(new Set());
  const releasedWordTransitionGateKeysRef = useRef(new Set());
  const wordInitialTransitionTimerRef = useRef(null);

  // Once the learner has finished the Letter -> Word loading screen, that
  // readiness decision is monotonic for this assessment. Later polling or
  // duplicate realtime packets must never re-apply the restraint.
  const releaseFirstWordControls = useCallback((gateKey) => {
    releasedWordTransitionGateKeysRef.current.add(gateKey);
    learnerWordReadyKeysRef.current.delete(gateKey);

    if (wordInitialTransitionTimerRef.current) {
      window.clearTimeout(wordInitialTransitionTimerRef.current);
      wordInitialTransitionTimerRef.current = null;
    }

    if (wordInitialTransitionGateKeyRef.current === gateKey) {
      setWordInitialTransitionPending(false);
    }
  }, []);

  const miscueWriteChainsRef =
    useRef(new Map());

  const miscueMutationVersionRef =
    useRef(new Map());

  const passageTimerRef =
    useRef(null);

  const passageClockRef =
    useRef({
      startedAtMs: 0,
      pausedAtMs: null,
      pausedAccumulatedMs: 0,
      frozenSeconds: 0,
      paused: false,
    });

  const passageFinalizingRef =
    useRef(false);

  const fetchInFlightRef =
    useRef(false);

  const latestSessionVersionRef =
    useRef(0);

  const latestSessionRef =
    useRef(null);

  const latestActiveStageRef =
    useRef(activeStage);

  const assessmentChannelRef =
    useRef(null);

  const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);

  const currentQuestion =
    currentQuestions[
      questionIndex
    ];

  const currentAnswerRestraintKey =
    activeStage === "letter"
      ? `${String(code).toUpperCase()}:letter:${letterIndex}`
      : activeStage === "word"
        ? `${String(code).toUpperCase()}:word:${wordIndex}`
        : activeStage === "comprehension"
          ? `${String(code).toUpperCase()}:comprehension:${questionIndex}`
          : "";
  const answerRestraintPending =
    Boolean(currentAnswerRestraintKey) &&
    releasedAnswerRestraintKey !== currentAnswerRestraintKey;

  const passageText =
    activeStage === "passage" && String(session?.current_content || "").trim()
      ? String(session.current_content)
      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"
        ? FIELD_PASSAGE_TEXT
        : PASSAGE_TEXT;

  const passageHasStarted = Boolean(
    session?.passage_started_at || session?.passageStartedAt
  );

  useEffect(() => {
    if (activeStage !== "passage") {
      setPassageStageConfirmed(false);
      return;
    }

    if (
      !storySelecting &&
      String(session?.story_title || session?.storyTitle || "").trim() &&
      String(session?.current_content || session?.currentContent || "").trim()
    ) {
      setPassageStageConfirmed(true);
    }
  }, [
    activeStage,
    session?.currentContent,
    session?.current_content,
    session?.storyTitle,
    session?.story_title,
    storySelecting,
  ]);

  const pendingAnswerRef =
    useRef(false);

  const passageDraftRef =
    useRef({
      code,
      timerSeconds: 0,
      wordsRead: 100,
      miscues: [],
      comprehension: [],
    });

  // Keep every Part 1 response in an independent local journal. Polling can
  // legitimately see a temporarily partial cloud snapshot while background
  // writes are still completing; it must never erase answers already recorded
  // by the teacher in this assessment.
  const part1ResultsDraftRef = useRef({
    code,
    task1Results: [],
    task2Results: [],
  });
  const part1ResultsSavePromiseRef = useRef(Promise.resolve(false));

  /*
   * Comprehension journal (see mergeComprehensionResults). Kept in a ref so
   * reads inside event handlers and the review overlay are always current, and
   * persisted to IndexedDB so a reload cannot drop recorded answers.
   */
  const comprehensionDraftRef = useRef({ code, comprehension: [] });
  const comprehensionSavePromiseRef = useRef(Promise.resolve(false));
  const comprehensionPersistPromiseRef = useRef(Promise.resolve(null));

  const reconcilePart1Results = useCallback((incomingSession) => {
    if (!incomingSession) return incomingSession;

    const currentDraft =
      part1ResultsDraftRef.current?.code === code
        ? part1ResultsDraftRef.current
        : { code, task1Results: [], task2Results: [] };
    const task1Results = mergeReviewTaskResults(
      incomingSession.task1Results,
      currentDraft.task1Results
    );
    const task2Results = mergeReviewTaskResults(
      incomingSession.task2Results,
      currentDraft.task2Results
    );

    part1ResultsDraftRef.current = {
      code,
      task1Results,
      task2Results,
    };

    return {
      ...incomingSession,
      task1Results,
      task2Results,
    };
  }, [code]);

  const recordPart1Result = useCallback(
    (incomingSession, field, result) => {
      const reconciledSession = reconcilePart1Results(incomingSession || {});
      const answerSession = recordReviewTaskResult(
        reconciledSession,
        field,
        result
      );
      const nextDraft = {
        code,
        task1Results: mergeReviewTaskResults(answerSession.task1Results),
        task2Results: mergeReviewTaskResults(answerSession.task2Results),
      };

      part1ResultsDraftRef.current = nextDraft;
      part1ResultsSavePromiseRef.current =
        part1ResultsSavePromiseRef.current
          .catch(() => false)
          .then(() =>
            saveAssessmentState(
              `part1-results:${String(code).toUpperCase()}`,
              nextDraft
            )
          )
          .catch(() => false);

      return answerSession;
    },
    [code, reconcilePart1Results]
  );

  const persistPassageDraft = useCallback(
    async (patch = {}) => {
      passageDraftRef.current = {
        ...passageDraftRef.current,
        ...patch,
        code,
      };

      await saveAssessmentState(
        `passage:${String(code).toUpperCase()}`,
        passageDraftRef.current
      );

      return passageDraftRef.current;
    },
    [code]
  );

  useEffect(() => {
    if (!code) return;

    void getAssessmentState(
      `passage:${String(code).toUpperCase()}`
    ).then((draft) => {
      if (!draft) return;

      passageDraftRef.current = {
        ...passageDraftRef.current,
        ...draft,
        code,
      };

      if (Array.isArray(draft.miscues)) {
        setPassageMiscues(draft.miscues);
      }

      if (Number.isFinite(Number(draft.timerSeconds))) {
        setPassageSeconds(Number(draft.timerSeconds));
      }

      if (Number.isFinite(Number(draft.wordsRead))) {
        setPassageWordsRead(Number(draft.wordsRead));
      }

      if (Array.isArray(draft.comprehension)) {
        passageDraftRef.current.comprehension = draft.comprehension;
      }
    }).catch(() => {});
  }, [code]);

  useEffect(() => {
    if (!code) return;

    void getAssessmentState(
      `part1-results:${String(code).toUpperCase()}`
    ).then((draft) => {
      if (!draft || String(draft.code || "") !== code) return;

      const currentDraft = part1ResultsDraftRef.current;
      part1ResultsDraftRef.current = {
        code,
        task1Results: mergeReviewTaskResults(
          draft.task1Results,
          currentDraft.task1Results
        ),
        task2Results: mergeReviewTaskResults(
          draft.task2Results,
          currentDraft.task2Results
        ),
      };

      setSession((currentSession) => {
        if (!currentSession) return currentSession;
        const reconciledSession = reconcilePart1Results(currentSession);
        latestSessionRef.current = reconciledSession;
        return reconciledSession;
      });
    }).catch(() => {});
  }, [code, reconcilePart1Results]);

  /*
   * Record one comprehension answer into the local journal and mirror it to
   * IndexedDB. Returns the merged journal so callers can publish/submit it
   * without waiting for a server round trip.
   */
  const recordComprehensionResult = useCallback(
    (result) => {
      const entry = normalizeComprehensionResult(result);
      if (!entry) {
        return comprehensionDraftRef.current?.code === code
          ? comprehensionDraftRef.current.comprehension
          : [];
      }

      const currentDraft =
        comprehensionDraftRef.current?.code === code
          ? comprehensionDraftRef.current
          : { code, comprehension: [] };

      const comprehension = mergeComprehensionResults(
        currentDraft.comprehension,
        [entry]
      );

      comprehensionDraftRef.current = { code, comprehension };

      comprehensionSavePromiseRef.current =
        comprehensionSavePromiseRef.current
          .catch(() => false)
          .then(() =>
            saveAssessmentState(
              `comprehension:${String(code).toUpperCase()}`,
              { code, comprehension }
            )
          )
          .catch(() => false);

      return comprehension;
    },
    [code]
  );

  /*
   * The authoritative comprehension snapshot for both display and submission:
   * the teacher's journal wins over whatever the passage draft or server last
   * reported.
   */
  const comprehensionSnapshot = useCallback(() => {
    const journal =
      comprehensionDraftRef.current?.code === code
        ? comprehensionDraftRef.current.comprehension
        : [];

    return mergeComprehensionResults(
      passageDraftRef.current?.comprehension || [],
      journal
    );
  }, [code]);

  useEffect(() => {
    if (!code) return;

    void getAssessmentState(
      `comprehension:${String(code).toUpperCase()}`
    ).then((draft) => {
      if (!draft) return;

      const currentDraft =
        comprehensionDraftRef.current?.code === code
          ? comprehensionDraftRef.current
          : { code, comprehension: [] };

      const comprehension = mergeComprehensionResults(
        draft.comprehension,
        currentDraft.comprehension
      );

      comprehensionDraftRef.current = { code, comprehension };

      if (comprehension.length) {
        passageDraftRef.current = {
          ...passageDraftRef.current,
          comprehension,
          code,
        };
      }
    }).catch(() => {});
  }, [code]);

  const fetchSession =
    useCallback(
      async (options = {}) => {
        /*
         * The periodic reconciliation poll asks for the lean payload: it skips
         * the result-set reads on the server, which are the bulk of that
         * request's queries. Every other caller - the initial load and the
         * post-transition reconciliation - still fetches the full snapshot.
         */
        const lean = options?.lean === true;

        if (assessmentSaveLockRef.current) {
          return;
        }

        if (
          fetchInFlightRef.current
        ) {
          return;
        }

      if (!code) {
        setError(
          "Assessment code is missing."
        );
        setLoading(
          false
        );
        return;
      }

      fetchInFlightRef.current =
        true;

      try {
        const response =
          await fetch(
            `/api/assessment?action=host_get&code=${encodeURIComponent(
              code
            )}${lean ? "&lean=1" : ""}`,
            {
              credentials:
                "include",
              cache:
                "no-store",
            }
          );

        const data =
          await response.json();

        if (data?.session) {
          data.session = reconcilePart1Results(data.session);
        }

        if (data?.session?.assessment_content && applyLiveAssessmentContent(data.session)) {
          setAssessmentContentVersion((version) => version + 1);
        }

        if (!response.ok) {
          if (
            response.status === 404 &&
            latestSessionRef.current
          ) {
            return;
          }

          throw new Error(
            data.error ||
              "Unable to retrieve assessment session."
          );
        }

        const liveTeacherSession = latestSessionRef.current;
        if (data?.session) {
          const monotonicSession = mergeMonotonicTeacherSession(
            liveTeacherSession,
            data.session
          );
          if (
            liveTeacherSession &&
            monotonicSession === liveTeacherSession &&
            data.session !== liveTeacherSession
          ) {
            return;
          }
          data.session = monotonicSession;
        }

        if (
          data?.session?.stage === "terminated" &&
          data?.session?.current_content === "ZERO_SCORE_PART1_TASK1"
        ) {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "terminated";
          setSession(data.session);
          setActiveStage("terminated");
          if (!terminationObservationHandledRef.current) {
            terminationObservationHandledRef.current = true;
            openAssessmentSaveModal(data.session);
          }
          return;
        }

        if (data?.session?.stage === "learner_experience") {
          assessmentSaveLockRef.current = false;
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "learner_experience";
          setSession(data.session);
          setActiveStage("learner_experience");
          return;
        }

        if (data?.session?.stage === "teacher_review") {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "teacher_review";
          setSession(data.session);
          setActiveStage("teacher_review");
          if (!terminationObservationHandledRef.current) {
            terminationObservationHandledRef.current = true;
            openAssessmentSaveModal(data.session);
          }
          return;
        }

        if (
          data?.session &&
          data.session.stage === "completed" &&
          !terminationObservationHandledRef.current
        ) {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "completed";
          setSession(data.session);
          setActiveStage("completed");
          terminationObservationHandledRef.current = true;
          openAssessmentSaveModal(data.session);
          return;
        }

        if (
          data?.session &&
          data.session.ended
        ) {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current =
            data.session.stage || "ended";
          setSession(data.session);
          setActiveStage(
            data.session.stage || "ended"
          );
          return;
        }

        if (
          liveTeacherSession &&
          isTeacherStageRegression(data.session?.stage, liveTeacherSession.stage)
        ) {
          return;
        }
        const incomingPassageContent = String(data.session?.current_content ?? data.session?.currentContent ?? "").trim();
        const livePassageContent = String(liveTeacherSession?.current_content ?? liveTeacherSession?.currentContent ?? "").trim();
        const incomingPassageTitle = String(data.session?.story_title ?? data.session?.storyTitle ?? "").trim();
        const livePassageTitle = String(liveTeacherSession?.story_title ?? liveTeacherSession?.storyTitle ?? "").trim();
        if (liveTeacherSession?.stage === "passage" && data.session?.stage === "passage" && livePassageContent && !crlIsStoryPlaceholder(livePassageContent) && (crlIsStoryPlaceholder(incomingPassageContent) || (livePassageTitle && incomingPassageTitle && livePassageTitle.toLowerCase() !== incomingPassageTitle.toLowerCase()))) {
          return;
        }

        const incomingVersion =
          Date.parse(
            data.session?.updated_at ||
              data.session?.updatedAt ||
              ""
          ) || 0;

        const incomingStage = String(data.session?.stage || "");
        const incomingContent = String(
          data.session?.current_content ??
            data.session?.currentContent ??
            ""
        );
        const incomingComprehensionIndex =
          incomingStage === "comprehension"
            ? getComprehensionQuestions(data.session).findIndex((question) => question.text === incomingContent)
            : -1;

        if (
          incomingVersion >=
          latestSessionVersionRef.current
        ) {
          latestSessionVersionRef.current =
            incomingVersion;

          const currentSession =
            latestSessionRef.current;

          const currentStage =
            currentSession?.stage ||
            latestActiveStageRef.current;

          const currentContent = String(
            currentSession?.current_content ??
              currentSession?.currentContent ??
              ""
          );
          const incomingItemIndex =
            incomingStage === "letter"
              ? LETTERS.indexOf(incomingContent)
              : incomingStage === "word"
                ? WORDS.indexOf(incomingContent)
                : -1;
          const currentItemIndex =
            currentStage === "letter"
              ? LETTERS.indexOf(currentContent)
              : currentStage === "word"
                ? WORDS.indexOf(currentContent)
                : -1;

          // Polling can briefly return the preceding item while an optimistic
          // advance is being persisted. Never let that stale same-stage item
          // move the teacher UI backward or recreate an already-released gate.
          if (
            incomingStage === currentStage &&
            ["letter", "word"].includes(incomingStage) &&
            incomingItemIndex >= 0 &&
            currentItemIndex >= 0 &&
            incomingItemIndex < currentItemIndex
          ) {
            return;
          }

          if (
            currentStage === "comprehension" &&
            incomingComprehensionIndex >= 0 &&
            incomingComprehensionIndex < questionIndexRef.current
          ) {
            return;
          }

          const incomingWaiting =
            data.session?.stage === "waiting" &&
            !data.session?.ended;

          const currentIsActive =
            Boolean(currentSession?.learner_id) &&
            !currentSession?.ended &&
            !["waiting", "connected"].includes(currentStage);

          if (incomingWaiting && currentIsActive) {
            return;
          }

          const reconciledSession =
            mergeMonotonicTeacherSession(
              currentSession,
              data.session
            );

          latestSessionRef.current =
            reconciledSession;

          latestActiveStageRef.current =
            reconciledSession?.stage ||
            latestActiveStageRef.current;

          setSession(reconciledSession);

          const serverStage =
            reconciledSession?.stage;

          if (serverStage) {
            setActiveStage(serverStage);

            const serverContent =
              String(
                reconciledSession?.current_content ??
                  reconciledSession?.currentContent ??
                  ""
              );

            if (serverStage === "letter") {
              const serverIndex =
                LETTERS.indexOf(serverContent);

              if (serverIndex >= 0) {
                /*
                 * A lagging poll snapshot must never move the teacher back to
                 * an earlier item, so only ever raise the index here.
                 */
                setLetterIndex((previous) =>
                  serverIndex >= previous ? serverIndex : previous
                );
              }
            }

            if (serverStage === "word") {
              const serverIndex =
                WORDS.indexOf(serverContent);

              if (serverIndex >= 0) {
                setWordIndex((previous) =>
                  serverIndex >= previous ? serverIndex : previous
                );
              }
            }

            if (serverStage === "comprehension") {
              const serverIndex =
                getComprehensionQuestions(reconciledSession).findIndex(
                  (question) =>
                    question.text === serverContent
                );

              if (serverIndex >= questionIndexRef.current) {
                questionIndexRef.current = serverIndex;
                setQuestionIndex(serverIndex);
              }
            }
          }
        }

      } catch (fetchError) {
        /*
         * Keep a previously loaded assessment visible during a transient
         * polling failure. The next poll will retry automatically.
         */
        if (!session) {
          setError(
            fetchError.message ||
              "Unable to load assessment."
          );
        }
      } finally {
        fetchInFlightRef.current =
          false;

        setLoading(
          false
        );
      }
      },
      [code, reconcilePart1Results]
    );


  const selectStory = useCallback(
    async (story) => {
      if (storySelecting || busy || !story?.available) return;

      setStorySelecting(true);
      setError("");
      setPassageStageConfirmed(false);
      /*
       * A new passage gets a fresh readiness gate. Clearing here means the new
       * story can only be started once the learner confirms the new text, so a
       * leftover confirmation from a previous selection can never start the
       * clock against content the learner has not seen.
       */
      learnerPassageRenderedKeysRef.current.clear();
      if (learnerPassageWaitRef.current) {
        learnerPassageWaitRef.current.resolve(false);
        learnerPassageWaitRef.current = null;
      }
      const previousSession = latestSessionRef.current || session;

      const next = {
        code,
        stage: "passage",
        currentContent: String(story?.text || ""),
        storyTitle: String(story?.title || ""),
        story_title: String(story?.title || ""),
      };

      /*
       * Show the selected story immediately on the teacher side. The learner
       * receives the same state through the lightweight host session endpoint.
       */
      const optimistic = {
        ...(latestSessionRef.current || {}),
        ...next,
        story_title: String(story?.title || ""),
        storyTitle: String(story?.title || ""),
        current_content: String(story?.text || ""),
        currentContent: String(story?.text || ""),
        connected: true,
      };

      latestSessionRef.current = optimistic;
      latestActiveStageRef.current = "passage";
      latestSessionVersionRef.current = Date.now();
      setSession(optimistic);
      setActiveStage("passage");
      publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: optimistic });
      void publishAssessmentRealtimeState(code, optimistic);
      /* CRL_STORY_PASSAGE_IMMEDIATE_BROADCAST_V2 */

      try {
        await finalWordSavePromiseRef.current;
        const response = await fetch(
          "/api/assessment?action=select_story",
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              action: "select_story",
              code,
              story_id: story.id,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Unable to start the selected story."
          );
        }

        if (data?.session) {
          latestSessionRef.current = {
            ...latestSessionRef.current,
            ...data.session,
            stage: "passage",
            story_title: String(story?.title || data.session.story_title || data.session.storyTitle || ""),
            storyTitle: String(story?.title || data.session.story_title || data.session.storyTitle || ""),
            current_content: String(story?.text || data.session.current_content || data.session.currentContent || ""),
            currentContent: String(story?.text || data.session.current_content || data.session.currentContent || ""),
            connected:
              data.session.connected ??
              latestSessionRef.current?.connected ??
              true,
          };
          latestActiveStageRef.current = "passage";
          setSession(latestSessionRef.current);
          setActiveStage("passage");
          void publishAssessmentRealtimeState(
            code,
            latestSessionRef.current
          );
        }
        setPassageStageConfirmed(true);
      } catch (error) {
        // A passage cannot be timed until story selection is durably accepted.
        // Restore Story Choice so the teacher can retry instead of exposing a
        // Start button that is guaranteed to receive a stage-conflict error.
        // A retry is safe because select_story is idempotent server-side: if
        // the first attempt was actually applied, replaying it succeeds rather
        // than failing with "not currently at story selection".
        const retrySession = {
          ...(previousSession || {}),
          stage: "story_choice",
          current_content: "Choose a story passage. The teacher will select it.",
          currentContent: "Choose a story passage. The teacher will select it.",
          story_title: "",
          storyTitle: "",
        };
        latestSessionRef.current = retrySession;
        latestActiveStageRef.current = "story_choice";
        setSession(retrySession);
        setActiveStage("story_choice");
        setError(
          error?.message ||
            "Unable to start the selected story."
        );
      } finally {
        setStorySelecting(false);
      }
    },
    [code, storySelecting, busy, session]
  );

  const startPassageTimer =
    useCallback(
      async () => {
        if (
          activeStage !== "passage" ||
          storySelecting ||
          !passageStageConfirmed ||
          passageTimerRequestRef.current ||
          latestSessionRef.current?.passage_started_at ||
          latestSessionRef.current?.passageStartedAt
        ) return;

        passageTimerRequestRef.current = true;
        setStartingPassageReading(true);
        setError("");

        /*
         * The clock must not run while the learner device is still blank or has
         * not laid the passage out yet. The learner pre-renders the passage as
         * soon as it receives it and confirms with a "passage_rendered" control
         * packet, so this wait is normally already satisfied and costs nothing.
         * The timeout only exists so a lost packet - or a teacher-only run -
         * can never strand the assessment.
         */
        const gateSession = latestSessionRef.current || session;
        const learnerAttached =
          Boolean(gateSession?.learner_id ?? gateSession?.learnerId) &&
          gateSession?.connected !== false;

        if (learnerAttached) {
          setWaitingForLearnerPassage(true);
          try {
            await waitForLearnerPassage(
              getAssessmentPassageGateKey(code, gateSession),
              PASSAGE_RENDER_WAIT_MS
            );
          } finally {
            setWaitingForLearnerPassage(false);
          }
        }

        await new Promise((resolve) => window.setTimeout(resolve, 140));

        const startedAt = new Date().toISOString();
        const optimisticSession = {
          ...(latestSessionRef.current || {}),
          passage_started_at: startedAt,
          passageStartedAt: startedAt,
          passage_paused_at: null,
          passagePausedAt: null,
          passage_paused_seconds: 0,
          passagePausedSeconds: 0,
        };
        latestSessionRef.current = optimisticSession;
        setSession(optimisticSession);
        setPassageSeconds(0);
        setPassagePaused(false);
        setStartingPassageReading(false);
        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: optimisticSession,
        });
        void publishAssessmentRealtimeState(code, optimisticSession);

        try {
          const response = await fetch("/api/assessment?action=passage_ready", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              action: "passage_ready",
              code,
              started_at: startedAt,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || "Unable to start the passage timer.");

          const serverSession = {
            ...(latestSessionRef.current || {}),
            ...(data.session || {}),
            passage_started_at: data.passage_started_at,
            passageStartedAt: data.passage_started_at,
            passage_paused_at: data.passage_paused_at,
            passagePausedAt: data.passage_paused_at,
            passage_paused_seconds: data.passage_paused_seconds,
            passagePausedSeconds: data.passage_paused_seconds,
          };
          const nextSession = mergeMonotonicTeacherSession(
            latestSessionRef.current,
            serverSession
          );
          latestSessionRef.current = nextSession;
          setSession(nextSession);
          publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: nextSession });
          void publishAssessmentRealtimeState(code, nextSession);
        } catch (startError) {
          /*
           * Starting the visible clock is irreversible for this passage.
           * A transient network failure must not reveal Start Reading again
           * or let a second click reset elapsed time. Persist the same
           * timestamp through the durable assessment outbox instead.
           */
          await putMutation({
            id: `boundary:passage_ready:${String(code).toUpperCase()}`,
            action: "passage_ready",
            payload: {
              code,
              started_at: startedAt,
            },
            createdAt: Date.now(),
          });
          console.warn("Passage start queued for retry:", startError);
        } finally {
          setStartingPassageReading(false);
          passageTimerRequestRef.current = false;
        }
      },
      [activeStage, code, passageStageConfirmed, storySelecting, session, waitForLearnerPassage]
    );

  const controlPassageTimer =
    useCallback(
      async (mode) => {
        if (
          activeStage !== "passage" ||
          passageTimerRequestRef.current
        ) {
          return;
        }

        const clock =
          passageClockRef.current;

        if (
          !clock.startedAtMs
        ) {
          return;
        }

        const shouldPause =
          mode === "pause";

        if (
          shouldPause ===
          clock.paused
        ) {
          return;
        }

        passageTimerRequestRef.current =
          true;

        const previous = {
          paused: clock.paused,
          pausedAtMs:
            clock.pausedAtMs,
          pausedAccumulatedMs:
            clock.pausedAccumulatedMs,
        };

        if (shouldPause) {
          /*
           * Freeze the displayed value before changing state. The timer
           * effect will return this exact value on every tick while paused.
           */
          const now = Date.now();

          clock.frozenSeconds =
            Math.min(
              120,
              Math.max(
                0,
                Math.floor(
                  (
                    now -
                    clock.startedAtMs -
                    clock.pausedAccumulatedMs
                  ) / 1000
                )
              )
            );

          clock.paused = true;
          clock.pausedAtMs = now;

          setPassageSeconds(
            clock.frozenSeconds
          );
          setPassagePaused(true);
        } else {
          const pauseDuration =
            clock.pausedAtMs
              ? Math.max(
                  0,
                  Date.now() -
                    clock.pausedAtMs
                )
              : 0;

          clock.pausedAccumulatedMs +=
            pauseDuration;
          clock.pausedAtMs = null;
          clock.paused = false;

          setPassagePaused(false);
          setTimeUpSelecting(false);
        }

        try {
          const response =
            await fetch(
              "/api/assessment?action=passage_timer",
              {
                method: "POST",
                credentials:
                  "include",
                cache:
                  "no-store",
                headers: {
                  "Content-Type":
                    "application/json",
                  Accept:
                    "application/json",
                },
                body:
                  JSON.stringify({
                    action:
                      "passage_timer",
                    code,
                    mode,
                  }),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error ||
                "Unable to update the passage timer."
            );
          }

          /*
           * Do not overwrite the local pause duration with the server's
           * whole-second value. The server intentionally stores seconds,
           * while this clock keeps millisecond precision so a quick
           * pause/resume cannot cause a visible one-second jump.
           */
          /*
           * The local clock is authoritative for the visible UI. The server
           * response only confirms persistence; it must not move the pause
           * timestamp forward or change the frozen second.
           */
          setPassagePaused(
            clock.paused
          );

          setSession((current) => {
            if (!current) return current;

            const next = {
              ...current,
              passage_started_at:
                data.passage_started_at,
              passageStartedAt:
                data.passage_started_at,
              passage_paused_at:
                data.passage_paused_at,
              passagePausedAt:
                data.passage_paused_at,
              passage_paused_seconds:
                data.passage_paused_seconds,
              passagePausedSeconds:
                data.passage_paused_seconds,
            };

            latestSessionRef.current =
              next;

            return next;
          });

          void publishAssessmentRealtimeState(
            code,
            latestSessionRef.current
          );
        } catch (timerError) {
          clock.paused =
            previous.paused;
          clock.pausedAtMs =
            previous.pausedAtMs;
          clock.pausedAccumulatedMs =
            previous.pausedAccumulatedMs;

          setPassagePaused(
            previous.paused
          );

          setError(
            timerError?.message ||
              "Unable to update the passage timer."
          );
        } finally {
          passageTimerRequestRef.current =
            false;
        }
      },
      [activeStage, code]
    );

  const passageWordElements =
    useMemo(
      () => {
        let wordNumber = 0;

        const miscueColors = {
          Insertion: {
            background: "#edf1f7",
            color: "#1a2b4c",
            border: "#7f9dc4",
          },
          Reversion: {
            background: "#f5ede0",
            color: "#a9762f",
            border: "#dcb87a",
          },
          Omission: {
            background: "#ebc9c4",
            color: "#9b2e22",
            border: "#dda8a2",
          },
          Substitution: {
            background: "#f5ede0",
            color: "#835b24",
            border: "#dcb87a",
          },
          Repetition: {
            background: "#edf1f7",
            color: "#4a6fa5",
            border: "#c3ccd9",
          },
          SelfCorrection: {
            background: "#e8f0ea",
            color: "#2f5f49",
            border: "#d7e6dd",
          },
        };

        return passageText.split(/(\s+)/).map(
          (token, index) => {
            if (!token.trim()) {
              return token;
            }

            const currentNumber =
              wordNumber++;

            const annotation =
              passageMiscues.find(
                (item) =>
                  Number(item.wordIndex) ===
                  currentNumber
              );

            const annotationColor =
              annotation
                ? miscueColors[
                    annotation.miscueType
                  ] ||
                  miscueColors.Substitution
                : null;

            const isSelected =
              Number(
                selectedPassageWord
              ) ===
              currentNumber + 1;

            const markerStyle = annotation?.miscueType === "Omission"
              ? {}
              : annotation?.miscueType === "Repetition"
                ? { textDecoration: "underline double 3px #d9534f", textUnderlineOffset: "5px", textDecorationColor: "#d9534f" }
                : annotation?.miscueType === "Substitution"
                  ? { textDecoration: "underline 3px #d9534f", textUnderlineOffset: "5px", textDecorationColor: "#d9534f" }
                  : annotation?.miscueType === "SelfCorrection"
                    ? { textDecoration: "underline 2px #3e7a5e", textUnderlineOffset: "4px", textDecorationColor: "#3e7a5e" }
                    : {};
            const markerGlyph = annotation?.miscueType === "Insertion"
              ? "⌃"
              : annotation?.miscueType === "SelfCorrection"
                ? "✓"
                : annotation?.miscueType === "Reversion"
                  ? `${annotation?.reversionOrder || ""} ${Number(annotation?.relatedWordIndex) > currentNumber ? "↷" : "↶"}`.trim()
                  : "";

            return (
              <button
                key={
                  "passage-word-" +
                  index
                }
                type="button"
                className="crlPassageWord"
                style={{
                  ...styles.passageWord,
                  ...markerStyle,
                  position: "relative",
                  ...(annotationColor
                    ? {
                        background:
                          annotationColor.background,
                        color:
                          annotationColor.color,
                        boxShadow:
                          "inset 0 -3px 0 " +
                          annotationColor.border,
                      }
                    : {}),
                  ...(isSelected
                    ? styles.passageWordSelected
                    : {}),
                }}
                onClick={() => {
                  const number =
                    currentNumber + 1;

                  const existingMiscue =
                    passageMiscues.find(
                      (item) =>
                        Number(item.wordIndex) ===
                        currentNumber
                    );

                  if (
                    timeUpSelecting &&
                    timeUpReviewConfirmed
                  ) {
                    setPassageWordsRead(
                      number
                    );
                    setTimeUpSelecting(
                      false
                    );
                    setTimeUpSelectedWord(
                      number
                    );
                    setMiscueDrawerOpen(
                      false
                    );
                    setSelectedPassageWord(
                      null
                    );
                    setSelectedMiscueType(
                      null
                    );
                    setSubstitutionInputRequested(false);
                    setMisreadWord("");
                    return;
                  }

                  if (miscueReviewMode) {
                    setSubstitutionInputRequested(false);
                    setSelectedPassageWord(number);
                    setMiscueWordIndex(number);
                    setSelectedMiscueType(existingMiscue?.miscueType || null);
                    setMisreadWord(existingMiscue?.misreadWord || "");
                    setMiscueDrawerOpen(true);
                    return;
                  }

                  setSubstitutionInputRequested(false);
                  setSelectedPassageWord(
                    number
                  );
                  setMiscueWordIndex(
                    number
                  );
                  setSelectedMiscueType(
                    existingMiscue?.miscueType ||
                      null
                  );
                  setMisreadWord(
                    existingMiscue?.misreadWord ||
                      ""
                  );
                  setMiscueDrawerOpen(
                    true
                  );
                }}
                aria-label={
                  "Word " +
                  (currentNumber + 1) +
                  ": " +
                  token
                }
              >
                {annotation && (markerGlyph || ((annotation.miscueType === "Substitution") && annotation.misreadWord)) && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: annotation.miscueType === "Insertion" ? "auto" : "-16px",
                      bottom: annotation.miscueType === "Insertion" ? "-7px" : "auto",
                      left: annotation.miscueType === "Insertion" ? "4px" : "50%",
                      transform: annotation.miscueType === "Insertion" ? "none" : "translateX(-50%)",
                      color: annotation.miscueType === "SelfCorrection" ? "#3e7a5e" : annotation.miscueType === "Reversion" ? "#a9762f" : "#d9534f",
                      fontSize: annotation.miscueType === "Reversion" ? "12px" : "16px",
                      lineHeight: 1,
                      fontWeight: 950,
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                  >
                    {markerGlyph}
                    {annotation.miscueType === "Substitution" && annotation.misreadWord ? (
                      <span style={{ marginLeft: "3px", fontSize: "10px", fontWeight: 900 }}>{annotation.misreadWord}</span>
                    ) : null}
                  </span>
                )}
                <span className={annotation?.miscueType === "Omission" ? "crlOmissionWord" : undefined}>{token}</span>
              </button>
            );
          }
        );
      },
      [
        passageText,
        passageMiscues,
        selectedPassageWord,
        timeUpSelecting,
        timeUpReviewConfirmed,
        miscueReviewMode,
      ]
    );

  const finishPassageReading =
    useCallback(
      async (
        secondsOverride,
        wordsOverride
      ) => {
        if (passageFinalizingRef.current) return;

        passageFinalizingRef.current = true;
        setBusy(true);
        setError("");

        try {
          const seconds = Math.min(
            120,
            Math.max(
              0,
              Number(secondsOverride ?? passageSeconds)
            )
          );

          const wordsRead = Math.min(
            100,
            Math.max(
              0,
              Number(
                wordsOverride ??
                  (passageSeconds >= 120
                    ? passageWordsRead || 0
                    : 100)
              )
            )
          );

          await persistPassageDraft({
            timerSeconds: Math.round(seconds),
            wordsRead: Math.round(wordsRead),
            miscues: passageMiscues.slice(),
          });

          setPassageSeconds(Math.round(seconds));
          setPassageWordsRead(wordsRead);
          setTimeUpSelecting(false);
          setTimeUpReviewConfirmed(false);
          setMiscueDrawerOpen(false);
          setMiscueReviewMode(false);
          setReversionSelecting(false);
          setReversionSourceWord(null);
          setSelectedPassageWord(null);
          setSelectedMiscueType(null);
          setSubstitutionInputRequested(false);
          setMisreadWord("");

          if (passageTimerRef.current) {
            window.clearInterval(passageTimerRef.current);
            passageTimerRef.current = null;
          }

          const nextSession = {
            ...(latestSessionRef.current || {}),
            stage: "comprehension",
            current_content: getComprehensionQuestions(latestSessionRef.current || session)[0].text,
            currentContent: getComprehensionQuestions(latestSessionRef.current || session)[0].text,
            metrics: {
              ...(latestSessionRef.current?.metrics || {}),
              timerSeconds: Math.round(seconds),
              totalMiscues: passageMiscues.length,
              wordsRead: Math.max(0, 100 - passageMiscues.length),
              readingAccuracy: Math.max(0, 100 - passageMiscues.length),
              wpm:
                seconds > 0
                  ? Number(
                      (
                        (Math.max(0, 100 - passageMiscues.length) / seconds) *
                        60
                      ).toFixed(2)
                    )
                  : null,
              passageMiscues: passageMiscues.slice(),
            },
          };

          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = "comprehension";
          latestSessionVersionRef.current = Date.now();
          setQuestionIndex(0);
          setSession(nextSession);
          setActiveStage("comprehension");
          /* CRL_FIRST_COMPREHENSION_BROADCAST_V2 */
          publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: nextSession });
          void publishAssessmentRealtimeState(code, nextSession);

          void (async () => {
          try {
            const response = await fetch(
              "/api/assessment?action=finish_passage",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  action: "finish_passage",
                  code,
                  words_read: Math.round(wordsRead),
                  passage_miscues: passageMiscues,
                }),
              }
            );

            if (!response.ok) {
              const data = await response.json().catch(() => null);
              throw new Error(data?.error || "Unable to save the passage result.");
            }
            const data = await response.json();
            const synchronizedTimerSeconds = Math.round(
              Number(data.scoring?.timerSeconds ?? seconds)
            );
            await persistPassageDraft({
              timerSeconds: synchronizedTimerSeconds,
              wordsRead: Math.round(wordsRead),
              miscues: passageMiscues.slice(),
            });
            const currentSession = latestSessionRef.current || nextSession;
            const serverSession = {
              ...currentSession,
              stage: "comprehension",
              current_content: data.current_content || nextSession.current_content,
              currentContent: data.current_content || nextSession.currentContent,
              story_title: data.story_title || nextSession.story_title,
              storyTitle: data.story_title || nextSession.storyTitle,
              metrics: {
                ...(nextSession.metrics || {}),
                ...(data.scoring || {}),
                passageMiscues: passageMiscues.slice(),
              },
            };
            const monotonicSession = mergeMonotonicTeacherSession(
              currentSession,
              serverSession
            );
            const synchronizedSession =
              monotonicSession === currentSession
                ? {
                    ...currentSession,
                    metrics: serverSession.metrics,
                  }
                : monotonicSession;
            latestSessionRef.current = synchronizedSession;
            setSession(synchronizedSession);
            publishAssessmentState(assessmentChannelRef.current, {
              source: "teacher",
              session: synchronizedSession,
            });
            void publishAssessmentRealtimeState(code, synchronizedSession);
          } catch (syncError) {
            await putMutation({
              id: `boundary:finish_passage:${String(code).toUpperCase()}`,
              action: "finish_passage",
              payload: {
                code,
                words_read: Math.round(wordsRead),
                passage_miscues: passageMiscues,
              },
              createdAt: Date.now(),
            });
            void flushAnswerQueue();
            setError(syncError?.message || "Unable to save the passage result.");
          }
          })();
        } catch (error) {
          setError(
            error?.message ||
              "Unable to finish the passage."
          );
        } finally {
          passageFinalizingRef.current = false;
          setBusy(false);
        }
      },
      [
        code,
        passageMiscues,
        passageSeconds,
        passageWordsRead,
        persistPassageDraft,
      ]
    );

  const removePassageMiscue =
    useCallback(
      async () => {
        const selectedIndex =
          Number(selectedPassageWord || 0) - 1;

        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const selectedMiscue = passageMiscues.find((item) => Number(item.wordIndex) === selectedIndex);
        const relatedIndex = selectedMiscue?.miscueType === "Reversion" ? Number(selectedMiscue.relatedWordIndex) : -1;
        const nextMiscues = passageMiscues.filter((item) => Number(item.wordIndex) !== selectedIndex && Number(item.wordIndex) !== relatedIndex);

        setPassageMiscues(nextMiscues);
        setSelectedMiscueType(null);
        setSubstitutionInputRequested(false);
        setMisreadWord("");
        setError("");
        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setReversionSelecting(false);
        setReversionSourceWord(null);

        await persistPassageDraft({
          miscues: nextMiscues,
        });
        for (const wordIndex of [selectedIndex, relatedIndex]) {
          if (!Number.isInteger(wordIndex) || wordIndex < 0) continue;
          void queueAnswerForBackgroundSave("remove_passage_miscue", {
            code,
            word_index: wordIndex,
          });
        }
      },
      [
        selectedPassageWord,
        passageMiscues,
        miscueReviewMode,
        persistPassageDraft,
        code,
      ]
    );

  const recordPassageMiscue =
    useCallback(
      async (
        selectedWordOverride,
        typeOverride,
        misreadWordOverride,
        reversionTargetOverride
      ) => {
        const selectedNumber = Number(selectedWordOverride ?? selectedPassageWord ?? 0);
        const selectedIndex = selectedNumber - 1;
        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const nextType = String(typeOverride || selectedMiscueType || miscueType || "Substitution");
        const nextMisreadWord = String(misreadWordOverride ?? misreadWord ?? "").trim();

        if (nextType === "Substitution" && !nextMisreadWord) {
          setSelectedMiscueType(nextType);
          setSubstitutionInputRequested(true);
          return;
        }

        if (nextType === "Reversion") {
          const targetNumber = Number(reversionTargetOverride ?? 0);
          const targetIndex = targetNumber - 1;
          if (!Number.isInteger(targetNumber) || targetIndex < 0 || targetIndex >= 100 || targetIndex === selectedIndex) {
            setSelectedMiscueType(nextType);
            return;
          }

          const collidesWithExistingMiscue = passageMiscues.some((item) => {
            const wordIndex = Number(item.wordIndex);
            return wordIndex === selectedIndex || wordIndex === targetIndex;
          });

          if (collidesWithExistingMiscue) return;

          const groupId = [selectedIndex, targetIndex].sort((a, b) => a - b).join("-");
          const first = {
            wordIndex: selectedIndex,
            miscueType: "Reversion",
            misreadWord: "",
            relatedWordIndex: targetIndex,
            reversionGroupId: groupId,
            reversionOrder: 1,
          };
          const second = {
            wordIndex: targetIndex,
            miscueType: "Reversion",
            misreadWord: "",
            relatedWordIndex: selectedIndex,
            reversionGroupId: groupId,
            reversionOrder: 2,
          };

          const nextMiscues = [
            ...passageMiscues.filter(
              (item) =>
                Number(item.wordIndex) !== selectedIndex &&
                Number(item.wordIndex) !== targetIndex
            ),
            first,
            second,
          ].sort((a, b) => Number(a.wordIndex) - Number(b.wordIndex));

          setPassageMiscues(nextMiscues);
          setError("");
          setMisreadWord("");
          setMiscueWordIndex(1);
          setMiscueDrawerOpen(false);
          setSelectedPassageWord(null);
          setSelectedMiscueType(null);
          setSubstitutionInputRequested(false);
          setReversionSelecting(false);
          setReversionSourceWord(null);
          await persistPassageDraft({ miscues: nextMiscues });
          for (const item of [first, second]) {
            void queueAnswerForBackgroundSave("record_passage_miscue", {
              code,
              word_index: item.wordIndex,
              miscue_type: item.miscueType,
              misread_word: item.misreadWord,
            });
          }
          return;
        }

        const optimistic = {
          wordIndex: selectedIndex,
          miscueType: nextType,
          misreadWord: nextMisreadWord,
        };
        const nextMiscues = [
          ...passageMiscues.filter((item) => Number(item.wordIndex) !== selectedIndex),
          optimistic,
        ];

        setPassageMiscues(nextMiscues);
        setError("");
        setMisreadWord("");
        setMiscueWordIndex(1);
        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setSelectedMiscueType(null);
        setSubstitutionInputRequested(false);
        setReversionSelecting(false);
        setReversionSourceWord(null);
        await persistPassageDraft({ miscues: nextMiscues });
        void queueAnswerForBackgroundSave("record_passage_miscue", {
          code,
          word_index: optimistic.wordIndex,
          miscue_type: optimistic.miscueType,
          misread_word: optimistic.misreadWord,
        });
      },
      [
        selectedPassageWord,
        selectedMiscueType,
        miscueType,
        misreadWord,
        passageMiscues,
        persistPassageDraft,
        code,
      ]
    );

  useEffect(() => {
    if (activeStage !== "passage") {
      setMiscueDrawerOpen(false);
      setSelectedPassageWord(null);
      setSelectedMiscueType(null);
      setSubstitutionInputRequested(false);
      setReversionSelecting(false);
      setReversionSourceWord(null);
      setPassageMiscues([]);
      setPassageWordsRead(0);
      setPassagePaused(false);
      setTimeUpSelecting(false);
      setTimeUpReviewConfirmed(false);

      if (passageTimerRef.current) {
        window.clearInterval(
          passageTimerRef.current
        );
        passageTimerRef.current = null;
      }

      passageClockRef.current = {
        startedAtMs: 0,
        pausedAtMs: null,
        pausedAccumulatedMs: 0,
        paused: false,
      };

      return undefined;
    }

    if (miscueReviewMode) {
      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }
      return undefined;
    }

    const startedAt =
      session?.passage_started_at ||
      session?.passageStartedAt;

    if (!startedAt) {
      if (passageTimerRef.current) {
        window.clearInterval(
          passageTimerRef.current
        );
        passageTimerRef.current = null;
      }

      setPassageSeconds(0);
      return undefined;
    }

    const startedAtMs =
      new Date(startedAt).getTime();

    if (!Number.isFinite(startedAtMs)) {
      setPassageSeconds(0);
      return undefined;
    }

    const clock =
      passageClockRef.current;

    if (
      clock.startedAtMs !==
      startedAtMs
    ) {
      clock.startedAtMs =
        startedAtMs;
      clock.pausedAtMs = null;
      clock.pausedAccumulatedMs =
        Number(
          session?.passage_paused_seconds ||
            session?.passagePausedSeconds ||
            0
        ) * 1000;
      clock.frozenSeconds = 0;
      clock.paused = Boolean(
        session?.passage_paused_at ||
          session?.passagePausedAt
      );
      if (
        clock.paused &&
        !clock.pausedAtMs
      ) {
        clock.pausedAtMs =
          Date.now();
      }
    }

    const tick = () => {
      const current =
        passageClockRef.current;

      if (!current.startedAtMs) {
        return;
      }

      if (current.paused) {
        setPassageSeconds(
          current.frozenSeconds
        );
        setPassagePaused(true);
        return;
      }

      const now = Date.now();

      const elapsed =
        Math.min(
          120,
          Math.max(
            0,
            Math.floor(
              (
                now -
                current.startedAtMs -
                current.pausedAccumulatedMs
              ) / 1000
            )
          )
        );

      current.frozenSeconds =
        elapsed;

      setPassageSeconds(elapsed);
      setPassagePaused(false);

      if (
        elapsed >= 120 &&
        !current.paused &&
        !passageFinalizingRef.current
      ) {
        setTimeUpSelecting(true);
      }
    };

    tick();

    if (passageTimerRef.current) {
      window.clearInterval(
        passageTimerRef.current
      );
    }

    passageTimerRef.current =
      window.setInterval(
        tick,
        250
      );

    return () => {
      if (passageTimerRef.current) {
        window.clearInterval(
          passageTimerRef.current
        );
        passageTimerRef.current = null;
      }
    };
  }, [
    activeStage,
    miscueReviewMode,
    session?.passage_started_at,
    session?.passageStartedAt,
  ]);

  const handleLearnerAssessmentControl = useCallback(
    (message) => {
      // The learner sends the control fields at the top level of the message
      // ({ action, code, gate_key, ... }), so read them directly. Falling back
      // to `message.control` keeps compatibility with any wrapped payloads.
      const control = message?.control ?? message;
      if (control?.action === "passage_ready") {
        const incomingCode = String(control.code || "").trim().toUpperCase();
        if (incomingCode === String(code || "").trim().toUpperCase()) void fetchSession();
        return;
      }

      /*
       * The learner confirms once the whole passage is genuinely laid out on its
       * screen. Start Reading waits on this gate key, so the reading clock only
       * begins when the learner can actually see the text.
       */
      if (
        control?.action === "passage_rendered" ||
        control?.action === "passage_visible"
      ) {
        const incomingCode = String(control.code || "").trim().toUpperCase();
        if (incomingCode !== String(code || "").trim().toUpperCase()) return;

        const gateKey = String(control.gate_key || "");
        if (!gateKey) return;

        markLearnerPassageRendered(gateKey);
        /*
         * Also credit the gate the teacher is actually waiting on. The learner
         * only ever sends this while it is genuinely showing the passage for
         * this code, so a harmless difference in the story title between the two
         * devices (extra spacing, different casing source) must not force the
         * teacher to sit through the fallback timeout.
         */
        markLearnerPassageRendered(
          getAssessmentPassageGateKey(code, latestSessionRef.current)
        );
        return;
      }

      if (control?.action !== "word_first_item_ready") return;

      const incomingCode = String(control.code || "").trim().toUpperCase();
      if (incomingCode !== String(code || "").trim().toUpperCase()) return;

      const gateKey = String(control.gate_key || "");
      if (!gateKey) return;

      // Keep this listener stable across React session updates during the final
      // Letter -> Word handoff. Always read the current session from the ref so
      // the learner readiness signal cannot be lost during listener recreation.
      const current = latestSessionRef.current;
      if (!current) return;

      const expectedGateKey = getAssessmentWordGateKey(code, current);
      if (gateKey !== expectedGateKey) return;

      learnerWordReadyKeysRef.current.add(gateKey);

      const currentStage = String(current?.stage || latestActiveStageRef.current || "");
      const currentContent = String(current?.current_content ?? current?.currentContent ?? "").trim();
      const currentIsFirstWord = currentStage === "word" && WORDS.indexOf(currentContent) === 0;

      if (currentIsFirstWord && wordInitialTransitionGateKeyRef.current === gateKey) {
        learnerWordReadyKeysRef.current.delete(gateKey);
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }
        releaseFirstWordControls(gateKey);
      }
    },
    [code, releaseFirstWordControls, markLearnerPassageRendered]
  );

  useEffect(() => {
    if (activeStage === "word" && wordIndex === 0) {
      const current = latestSessionRef.current;
      if (!current) return;
      const gateKey = getAssessmentWordGateKey(code, current);

      if (releasedWordTransitionGateKeysRef.current.has(gateKey)) {
        wordInitialTransitionGateKeyRef.current = gateKey;
        learnerWordReadyKeysRef.current.delete(gateKey);
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }
        setWordInitialTransitionPending(false);
        return;
      }

      if (wordInitialTransitionGateKeyRef.current !== gateKey) {
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }

        wordInitialTransitionGateKeyRef.current = gateKey;
        learnerWordReadyKeysRef.current.delete(gateKey);
        setWordInitialTransitionPending(true);

        // The learner's mandatory Letter -> Word transition overlay lasts
        // 2 seconds. The learner readiness packet is the primary unlock path.
        // This guarded local fallback sits just beyond that overlay so a lost
        // cross-device control packet can never leave the teacher stranded.
        wordInitialTransitionTimerRef.current = window.setTimeout(() => {
          wordInitialTransitionTimerRef.current = null;

          if (
            wordInitialTransitionGateKeyRef.current === gateKey &&
            latestActiveStageRef.current === "word" &&
            WORDS.indexOf(
              String(
                latestSessionRef.current?.current_content ??
                  latestSessionRef.current?.currentContent ??
                  ""
              ).trim()
            ) === 0
          ) {
            learnerWordReadyKeysRef.current.delete(gateKey);
            releaseFirstWordControls(gateKey);
          }
        }, 2300);
      }

      if (learnerWordReadyKeysRef.current.has(gateKey)) {
        learnerWordReadyKeysRef.current.delete(gateKey);
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }
        releaseFirstWordControls(gateKey);
      }

      return;
    }

    wordInitialTransitionGateKeyRef.current = "";
    learnerWordReadyKeysRef.current.clear();
    if (wordInitialTransitionTimerRef.current) {
      window.clearTimeout(wordInitialTransitionTimerRef.current);
      wordInitialTransitionTimerRef.current = null;
    }
    setWordInitialTransitionPending(false);
  }, [activeStage, wordIndex, code, releaseFirstWordControls]);

  /*
   * Open the realtime socket when the assessment screen mounts so the channel
   * join is already complete when the first item is marked, instead of racing
   * it and losing the early broadcasts.
   */
  useEffect(() => {
    void warmAssessmentRealtime().catch(() => null);
    if (code) void warmAssessmentPublisher(code).catch(() => null);
  }, [code]);

  useEffect(() => {
    if (!code) return undefined;
    const channel = createAssessmentChannel(code, (event) => {
      const message = event?.data;
      if (!message || message.type !== "assessment_control" || message.source !== "learner") return;
      handleLearnerAssessmentControl(message);
    });
    if (!channel) return undefined;
    return () => closeAssessmentChannel(channel);
  }, [code, handleLearnerAssessmentControl]);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    let channel = null;
    void createAssessmentRealtimeChannel(code, (message) => {
      if (cancelled || !message || message.source !== "learner") return;
      handleLearnerAssessmentControl(message);
    }).then((nextChannel) => {
      if (cancelled) {
        try { nextChannel?.unsubscribe(); } catch {}
        return;
      }
      channel = nextChannel;
    });
    return () => {
      cancelled = true;
      try { channel?.unsubscribe(); } catch {}
    };
  }, [code, handleLearnerAssessmentControl]);

  useEffect(() => {
    return () => {
      if (wordInitialTransitionTimerRef.current) {
        window.clearTimeout(wordInitialTransitionTimerRef.current);
        wordInitialTransitionTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!busy) {
      fetchSession();
    }

    /*
     * The teacher screen is driven by local optimistic state and the realtime
     * channel, so this reconciliation poll is only a safety net. Every poll is
     * a multi-query read, and on a small connection pool those reads compete
     * with the writes that actually move the assessment forward - which is felt
     * as later items trailing the teacher's taps. Keep it infrequent, and only
     * tighten it while a passage timer is running.
     */
    const intervalMs = activeStage === "passage" ? 1500 : 3500;
    const interval =
      window.setInterval(
        () => {
          if (!busy && !pendingAnswerRef.current && document.visibilityState === "visible") {
            fetchSession({ lean: true });
          }
        },
        intervalMs
      );

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !busy && !pendingAnswerRef.current) {
        fetchSession();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    fetchSession,
    busy,
    activeStage,
  ]);

  const joined =
    useMemo(
      () => {
        if (!session || session.ended) return false;

        const stage =
          session.stage || activeStage;

        return (
          Boolean(session.learner_id) &&
          (
            Boolean(session.connected) ||
            Boolean(session.linked_at) ||
            Boolean(session.linkedAt) ||
            !["waiting", "connected"].includes(stage)
          )
        );
      },
      [session, activeStage]
    );
  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const learner = session?.learner;
    if (!learner || typeof learner !== "object") return;

    const parts = [
      learner.first_name,
      learner.middle_name
        ? `${String(learner.middle_name).trim().charAt(0).toUpperCase()}.`
        : null,
      learner.last_name,
      learner.suffix,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const resolvedName = parts.join(" ").trim();
    if (!resolvedName) return;

    if (learnerDisplayNameRef.current !== resolvedName) {
      learnerDisplayNameRef.current = resolvedName;
      setStableLearnerDisplayName(resolvedName);
    }
  }, [session]);

  useEffect(() => {
    latestActiveStageRef.current = activeStage;
  }, [activeStage]);

  useEffect(() => {
    if (answerRestraintTimerRef.current) {
      window.clearTimeout(answerRestraintTimerRef.current);
      answerRestraintTimerRef.current = null;
    }

    if (!currentAnswerRestraintKey) return undefined;

    answerRestraintTimerRef.current = window.setTimeout(() => {
      answerRestraintTimerRef.current = null;
      setReleasedAnswerRestraintKey(currentAnswerRestraintKey);
    }, 2000);

    return () => {
      if (answerRestraintTimerRef.current) {
        window.clearTimeout(answerRestraintTimerRef.current);
        answerRestraintTimerRef.current = null;
      }
    };
  }, [currentAnswerRestraintKey]);

  useEffect(() => {
    const currentKey =
      activeStage === "letter"
        ? `letter:${letterIndex}`
        : activeStage === "word"
          ? `word:${wordIndex}`
          : activeStage === "comprehension"
            ? `comprehension:${questionIndex}`
            : "";

    if (answerLockKey && currentKey && answerLockKey !== currentKey) {
      if (answerActionLockRef.current === answerLockKey) {
        answerActionLockRef.current = "";
      }
      setAnswerLockKey("");
    }
  }, [activeStage, letterIndex, wordIndex, questionIndex, answerLockKey]);

  useEffect(() => {
    if (
      ["letter", "word"].includes(activeStage) &&
      transitionPending &&
      !pendingAnswerRef.current
    ) {
      setTransitionPending(false);
    }
  }, [activeStage, letterIndex, wordIndex, transitionPending]);

  useEffect(() => {
    if (!code) return undefined;
    const channel = createAssessmentChannel(code);
    assessmentChannelRef.current = channel;
    return () => {
      closeAssessmentChannel(channel);
      if (assessmentChannelRef.current === channel) {
        assessmentChannelRef.current = null;
      }
    };
  }, [code]);


  const answerQueueFlushingRef =
    useRef(false);
  const flushStartedAtRef = useRef(0);

  const flushAnswerQueue = useCallback(
    async () => {
      if (answerQueueFlushingRef.current) {
        /*
         * Safety valve. The per-request timeout stops a request hanging, but
         * this guard must never be able to block the queue permanently: while
         * it is stuck on true every queued answer is silently dropped.
         */
        if (Date.now() - flushStartedAtRef.current < 30000) return;
      }
      answerQueueFlushingRef.current = true;
      flushStartedAtRef.current = Date.now();

      try {
        const mutations = await getMutations();

        for (const mutation of mutations) {
          const mutationId = String(mutation.id || "");
          if (
            !mutationId.startsWith("answer:") &&
            !mutationId.startsWith("advance:") &&
            !mutationId.startsWith("stage:") &&
            !mutationId.startsWith("final:") &&
            !mutationId.startsWith("boundary:")
          ) {
            continue;
          }

          let saved = false;

          for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
            try {
              const endpoint =
                mutation.action === "commit_passage_assessment"
                  ? "/api/assessment/commit"
                  : `/api/assessment?action=${encodeURIComponent(
                      mutation.action
                    )}`;

              /*
               * Must be abortable. A bare fetch() with no timeout can hang
               * forever, and because this whole flush is guarded by
               * answerQueueFlushingRef, one stalled request would leave that
               * guard stuck on true and silently block every later flush -
               * losing every queued answer for the rest of the assessment.
               */
              const response = await fetchWithTimeout(
                endpoint,
                {
                  method: "POST",
                  credentials: "include",
                  cache: "no-store",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    action: mutation.action,
                    ...(mutation.payload || {}),
                    ...(mutationId.startsWith("answer:")
                      ? { persist_only: true }
                      : {}),
                  }),
                },
                8000
              );

              const data = await response.json();

              if (!response.ok) {
                throw new Error(
                  data?.error || "Unable to synchronize assessment answer."
                );
              }

              await removeMutation(mutation.id);
              saved = true;
            } catch {
              if (attempt < 2) {
                await new Promise((resolve) =>
                  window.setTimeout(resolve, 125 * 2 ** attempt)
                );
              }
            }
          }
        }
      } catch {
        /* IndexedDB/network recovery runs again on the next cycle. */
      } finally {
        answerQueueFlushingRef.current = false;
      }
    },
    []
  );

  const queueHostAdvanceForBackgroundRetry = useCallback(
    async (payload) => {
      await putMutation({
        id:
          `advance:${String(code).toUpperCase()}:${payload?.stage}:${payload?.item_index ?? payload?.currentContent}`,
        action: "host_advance",
        payload: {
          code,
          ...payload,
        },
        createdAt: Date.now(),
      });

      void flushAnswerQueue();
    },
    [code, flushAnswerQueue]
  );

  const queueAnswerForBackgroundSave = useCallback(
    async (action, payload) => {
      const id =
        `answer:${action}:${String(code).toUpperCase()}:${payload?.letter_index ?? payload?.word_index ?? payload?.question_index}`;

      await putMutation({
        id,
        action,
        payload,
        createdAt: Date.now(),
      });

      void flushAnswerQueue();
    },
    [code, flushAnswerQueue]
  );

  useEffect(() => {
    const retry = () => {
      void flushAnswerQueue();
    };

    window.addEventListener("online", retry);

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void flushAnswerQueue();
      }
    }, 1000);

    void flushAnswerQueue();

    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [flushAnswerQueue]);

  const persistAnswerWithRetry = useCallback(
    async (action, payload) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const response = await fetch(
            `/api/assessment?action=${encodeURIComponent(action)}`,
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                action,
                ...payload,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error || `Unable to save ${action}.`
            );
          }

          return data;
        } catch (error) {
          if (attempt === 3) {
            console.warn(
              "Assessment answer save retry exhausted:",
              error?.message || error
            );
            return null;
          }

          await new Promise((resolve) =>
            window.setTimeout(resolve, 125 * 2 ** attempt)
          );
        }
      }

      return null;
    },
    []
  );

  const recordLetter =
    async (
      isCorrect
    ) => {
      const currentIndex =
        letterIndex;
      const lockKey =
        "letter:" + currentIndex;

      if (
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current ||
        answerRestraintPending
      ) {
        return;
      }

      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);
      pendingAnswerRef.current = true;
      const isFinal = currentIndex === LETTERS.length - 1;
      const answerSession = recordPart1Result(
        latestSessionRef.current,
        "task1Results",
        { index: currentIndex, content: LETTERS[currentIndex], isCorrect }
      );

      if (!isFinal) {
        const nextIndex = currentIndex + 1;
        setTransitionPending(true);
        setLetterIndex(nextIndex);
        const optimisticLetterSession = {
          ...answerSession,
          stage: "letter",
          current_content: LETTERS[nextIndex],
          currentContent: LETTERS[nextIndex],
          connected: true,
        };
        latestSessionRef.current = optimisticLetterSession;
        latestActiveStageRef.current = "letter";
        latestSessionVersionRef.current = Date.now();
        setSession(optimisticLetterSession);
        setActiveStage("letter");
        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: optimisticLetterSession,
        });
        void publishAssessmentRealtimeState(code, optimisticLetterSession);

        void (async () => {
          /*
           * Persist directly first, exactly like host_advance does - that path
           * has proved reliable. The IndexedDB queue is now only a fallback,
           * because a flush that stalls silently drops every queued answer
           * (observed live: word results stayed at zero rows for a whole run).
           */
          const saved = await persistAnswerWithRetry(
            "record_letter",
            {
              code,
              letter_index: currentIndex,
              letter: LETTERS[currentIndex],
              is_correct: isCorrect,
              /*
               * Save the answer only. The serialized host_advance is the
               * single authoritative advance for non-final letters, so a slow
               * save that commits after the next mark can never rewind the
               * host back to an earlier letter.
               */
              persist_only: true,
            }
          );

          if (!saved) {
            await queueAnswerForBackgroundSave(
              "record_letter",
              {
                code,
                letter_index: currentIndex,
                letter: LETTERS[currentIndex],
                is_correct: isCorrect,
              }
            );
          }
        })();

        const nextLetter = {
          code,
          stage: "letter",
          currentContent: LETTERS[currentIndex + 1],
          storyTitle: "",
          item_index: currentIndex + 1,
          expected_stage: "letter",
          expected_current_content:
            LETTERS[currentIndex],
        };

        void (async () => {
          try {
            const response = await sendHostAdvanceSerialized(nextLetter);

            if (!response.ok) throw new Error("host advance failed");

            const data = await response.json();

            if (
              data?.session &&
              !data?.stale
            ) {
              const current = latestSessionRef.current;
              const monotonicSession = mergeMonotonicTeacherSession(
                current,
                data.session
              );

              if (monotonicSession !== current) {
                latestSessionRef.current = {
                  ...monotonicSession,
                  connected:
                    data.session.connected ??
                    current?.connected ??
                    true,
                };

                void publishAssessmentRealtimeState(
                  code,
                  latestSessionRef.current
                );
              }
            } else if (data?.stale && data?.session) {
              void healStaleHostAdvance(data.session);
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextLetter);
          } finally {
            setTransitionPending(false);
          }
        })();

        pendingAnswerRef.current = false;
        setBusy(false);
        return;
      }

      setTransitionPending(true);
      const isZeroScoreTask1 =
        answerSession.task1Results?.length === LETTERS.length &&
        answerSession.task1Results.every((item) => item.isCorrect === false);
      const optimisticPostTask1Session = isZeroScoreTask1
        ? {
            ...answerSession,
            stage: "terminated",
            current_content: "ZERO_SCORE_PART1_TASK1",
            currentContent: "ZERO_SCORE_PART1_TASK1",
            connected: false,
          }
        : {
            ...answerSession,
            stage: "word",
            current_content: WORDS[0],
            currentContent: WORDS[0],
            connected: true,
          };
      latestSessionRef.current = optimisticPostTask1Session;
      latestActiveStageRef.current = optimisticPostTask1Session.stage;
      latestSessionVersionRef.current = Date.now();
      setSession(optimisticPostTask1Session);
      setActiveStage(optimisticPostTask1Session.stage);
      if (isZeroScoreTask1) {
        terminationObservationHandledRef.current = true;
        openAssessmentSaveModal(optimisticPostTask1Session);
      }
      publishAssessmentState(assessmentChannelRef.current, {
        source: "teacher",
        session: optimisticPostTask1Session,
      });
      void publishAssessmentRealtimeState(code, optimisticPostTask1Session);

      const finalLetterSavePromise = (async () => {
        try {
        const data = await persistAnswerWithRetry(
          "record_letter",
          {
            code,
            letter_index: currentIndex,
            letter: LETTERS[currentIndex],
            is_correct: isCorrect,
            task1_results: answerSession.task1Results,
          }
        );

        if (!data) {
          await putMutation({
            id: `boundary:record_letter:${String(code).toUpperCase()}`,
            action: "record_letter",
            payload: {
              code,
              letter_index: currentIndex,
              letter: LETTERS[currentIndex],
              is_correct: isCorrect,
              task1_results: answerSession.task1Results,
            },
            createdAt: Date.now(),
          });
          void flushAnswerQueue();
          answerActionLockRef.current = "";
          setAnswerLockKey("");
          return null;
        }

        if (data.scoring?.hardTerminate) {
          const terminalSession = {
            ...(data.session || latestSessionRef.current || {}),
            ...(data.session || {
              code,
              stage: "terminated",
              current_content: "ZERO_SCORE_PART1_TASK1",
              currentContent: "ZERO_SCORE_PART1_TASK1",
              ended: true,
              connected: false,
            }),
            early_termination:
              data.early_termination || "part1_task1_zero",
            metrics: {
              ...(latestSessionRef.current?.metrics || {}),
              ...(data.scoring || {}),
            },
          };

          latestSessionRef.current = terminalSession;
          latestActiveStageRef.current = "terminated";
          setSession(terminalSession);
          setActiveStage("terminated");
          terminationObservationHandledRef.current = true;
          assessmentSaveLockRef.current = true;
          void publishAssessmentRealtimeState(code, terminalSession);
          openAssessmentSaveModal(terminalSession);
          return;
        }

        if (
          data.session &&
          latestSessionRef.current?.stage === "word" &&
          String(
            latestSessionRef.current?.current_content ??
              latestSessionRef.current?.currentContent ??
              ""
          ) === WORDS[0]
        ) {
          /*
           * Reset the word index only while the teacher is still on Word 1.
           * This final-letter save resolves asynchronously; if the teacher has
           * already marked Word 1 (clap) and moved to Word 2 (jump) before it
           * returns, an unconditional reset here reverted the display back to
           * clap while the learner stayed on jump.
           */
          setWordIndex(0);

          const nextSession = {
            ...latestSessionRef.current,
            ...data.session,
            task1Results: answerSession.task1Results,
            connected:
              data.session.connected ??
              latestSessionRef.current?.connected ??
              true,
          };

          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = String(nextSession.stage || "");
          latestSessionVersionRef.current = Date.now();
          setSession(nextSession);
          setActiveStage(nextSession.stage);

          // The final letter answer advances the authoritative host session
          // directly. Publish that resulting Word 1 state immediately so the
          // learner does not have to wait for polling/realtime to catch up.
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: nextSession,
          });
          void publishAssessmentRealtimeState(code, nextSession);
        }

        return data;
        } finally {
          if (isZeroScoreTask1) {
            pendingAnswerRef.current = false;
            setBusy(false);
            setTransitionPending(false);
          }
        }
      })().catch((saveError) => {
        console.warn("Final Letter Sounds save failed:", saveError);
        return null;
      });
      finalLetterSavePromiseRef.current = finalLetterSavePromise;

      if (!isZeroScoreTask1) {
        pendingAnswerRef.current = false;
        setBusy(false);
        setTransitionPending(false);
        return;
      }

      await finalLetterSavePromise;
    };

  const recordWord =
    async (
      isCorrect
    ) => {
      const requestedIndex = wordIndex;
      const lockKey = "word:" + requestedIndex;

      if (
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current ||
        answerRestraintPending
      ) {
        return;
      }

      // Lock synchronously before awaiting the Letter -> Word boundary save.
      // The click is now visibly registered immediately and cannot be lost to
      // duplicate delayed handlers.
      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);
      pendingAnswerRef.current = true;

      // Capture the boundary dependency for background persistence, but do
      // not block the already-released teacher controls or optimistic UI.
      const letterBoundaryPromise = finalLetterSavePromiseRef.current;

      const currentIndex = wordIndex;
      if (currentIndex !== requestedIndex) {
        pendingAnswerRef.current = false;
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setBusy(false);
        return;
      }

      const isFinal = currentIndex === WORDS.length - 1;

      const answerSession = recordPart1Result(
        latestSessionRef.current,
        "task2Results",
        { index: currentIndex, content: WORDS[currentIndex], isCorrect }
      );




      if (!isFinal) {
        const nextIndex = currentIndex + 1;
        setTransitionPending(true);
        setWordIndex(nextIndex);
        const optimisticWordSession = {
          ...answerSession,
          stage: "word",
          current_content: WORDS[nextIndex],
          currentContent: WORDS[nextIndex],
          connected: true,
        };
        latestSessionRef.current = optimisticWordSession;
        latestActiveStageRef.current = "word";
        latestSessionVersionRef.current = Date.now();
        setSession(optimisticWordSession);
        setActiveStage("word");
        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: optimisticWordSession,
        });
        void publishAssessmentRealtimeState(code, optimisticWordSession);

        /*
         * Persist the word answer directly first, exactly like Letter Sounds
         * does. The IndexedDB queue used to be the only path here, and that is
         * the same queue that was already observed silently dropping answers -
         * word rows stayed at zero for a whole run. It is now only the fallback.
         * persist_only keeps the serialized host_advance as the single
         * authoritative advance, so a slow save can never rewind the host.
         */
        void (async () => {
          try {
            await letterBoundaryPromise.catch(() => null);

            const saved = await persistAnswerWithRetry("record_word", {
              code,
              word_index: currentIndex,
              word: WORDS[currentIndex],
              is_correct: isCorrect,
              persist_only: true,
            });

            if (!saved) {
              await queueAnswerForBackgroundSave("record_word", {
                code,
                word_index: currentIndex,
                word: WORDS[currentIndex],
                is_correct: isCorrect,
              });
            }
          } catch {
            await queueAnswerForBackgroundSave("record_word", {
              code,
              word_index: currentIndex,
              word: WORDS[currentIndex],
              is_correct: isCorrect,
            });
          }
        })();

        const nextWord = {
          code,
          stage: "word",
          currentContent: WORDS[currentIndex + 1],
          storyTitle: "",
          item_index: currentIndex + 1,
          expected_stage: "word",
          expected_current_content:
            WORDS[currentIndex],
        };

        void (async () => {
          try {
            await letterBoundaryPromise.catch(() => null);
            const response = await sendHostAdvanceSerialized(nextWord);

            if (!response.ok) throw new Error("host advance failed");

            const data = await response.json();

            if (
              data?.session &&
              !data?.stale
            ) {
              const current = latestSessionRef.current;
              const monotonicSession = mergeMonotonicTeacherSession(
                current,
                data.session
              );

              if (monotonicSession !== current) {
                latestSessionRef.current = {
                  ...monotonicSession,
                  connected:
                    data.session.connected ??
                    current?.connected ??
                    true,
                };

                void publishAssessmentRealtimeState(
                  code,
                  latestSessionRef.current
                );
              }
            } else if (data?.stale && data?.session) {
              /*
               * A replayed or lost advance left the server on a different item.
               * Re-issue the teacher's current word against the server's real
               * state so the learner converges instead of stalling here.
               */
              void healStaleHostAdvance(data.session);
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextWord);
          } finally {
            setTransitionPending(false);
          }
        })();

        pendingAnswerRef.current = false;
        setBusy(false);
        return;
      }


      const task1Score = answerSession.task1Results?.filter(
        (item) => item.isCorrect
      ).length || 0;
      const task2Score = answerSession.task2Results?.filter(
        (item) => item.isCorrect
      ).length || 0;
      const shouldStopAfterPart1 = task1Score + task2Score <= 10;
      const optimisticNextSession = shouldStopAfterPart1
        ? {
            ...answerSession,
            code,
            stage: "terminated",
            current_content: "PART1_TOTAL_LOW",
            currentContent: "PART1_TOTAL_LOW",
            connected: false,
            metrics: {
              ...(answerSession.metrics || {}),
              task1Score,
              task2Score,
              totalPart1Score: task1Score + task2Score,
              part1ReadingLevel:
                task1Score + task2Score === 0
                  ? "Full Refresher"
                  : "Moderate Refresher",
              classification: "Low Emerging Reader",
            },
          }
        : {
            ...answerSession,
            code,
            stage: "story_choice",
            current_content: "",
            currentContent: "",
            story_title: "",
            storyTitle: "",
            connected: true,
          };
      latestSessionRef.current = optimisticNextSession;
      latestActiveStageRef.current = optimisticNextSession.stage;
      latestSessionVersionRef.current = Date.now();
      setSession(optimisticNextSession);
      setActiveStage(optimisticNextSession.stage);
      publishAssessmentState(assessmentChannelRef.current, {
        source: "teacher",
        session: optimisticNextSession,
      });
      void publishAssessmentRealtimeState(code, optimisticNextSession);
      if (shouldStopAfterPart1) {
        terminationObservationHandledRef.current = true;
        assessmentSaveLockRef.current = true;
        openAssessmentSaveModal(optimisticNextSession);
      } else {
        /*
         * Advance the authoritative host session to Story Choice with the fast
         * serialized host_advance, exactly like the non-final words. The final
         * record_word save below still persists the complete journal and
         * reconciles the Part 1 rows, but that heavier request must not delay
         * the learner's story choices on a slow connection.
         */
        const nextStoryChoice = {
          code,
          stage: "story_choice",
          currentContent: "Choose a story passage. The teacher will select it.",
          storyTitle: null,
          item_index: currentIndex + 1,
          expected_stage: "word",
          expected_current_content: WORDS[currentIndex],
        };

        void (async () => {
          try {
            const response = await sendHostAdvanceSerialized(nextStoryChoice);
            if (!response.ok) throw new Error("host advance failed");

            const data = await response.json();

            if (data?.session && !data?.stale) {
              const current = latestSessionRef.current;
              const monotonicSession = mergeMonotonicTeacherSession(
                current,
                data.session
              );

              if (monotonicSession !== current) {
                latestSessionRef.current = {
                  ...monotonicSession,
                  connected:
                    data.session.connected ??
                    current?.connected ??
                    true,
                };

                void publishAssessmentRealtimeState(
                  code,
                  latestSessionRef.current
                );
              }
            } else if (data?.stale && data?.session) {
              void healStaleHostAdvance(data.session);
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextStoryChoice);
          }
        })();
      }

      pendingAnswerRef.current = false;
      setBusy(false);
      setTransitionPending(false);

      const finalWordSavePromise = (async () => {
        const data = await persistAnswerWithRetry(
          "record_word",
          {
            code,
            word_index: currentIndex,
            word: WORDS[currentIndex],
            is_correct: isCorrect,
            task1_results: answerSession.task1Results,
            task2_results: answerSession.task2Results,
          }
        );

        if (!data) {
          await putMutation({
            id: `boundary:record_word:${String(code).toUpperCase()}`,
            action: "record_word",
            payload: {
              code,
              word_index: currentIndex,
              word: WORDS[currentIndex],
              is_correct: isCorrect,
              task1_results: answerSession.task1Results,
              task2_results: answerSession.task2Results,
            },
            createdAt: Date.now(),
          });
          void flushAnswerQueue();
          return null;
        }

        if (data.scoring?.hardTerminate) {
          const terminalSession = {
            ...(latestSessionRef.current || optimisticNextSession),
            ...(data.session || {}),
            stage: "terminated",
            current_content:
              data.session?.current_content || "PART1_TOTAL_LOW",
            currentContent:
              data.session?.current_content || "PART1_TOTAL_LOW",
            connected: false,
            early_termination:
              data.early_termination || "part1_total_low",
            metrics: {
              ...(latestSessionRef.current?.metrics || {}),
              ...(data.scoring || {}),
            },
          };
          latestSessionRef.current = terminalSession;
          latestActiveStageRef.current = "terminated";
          setSession(terminalSession);
          setActiveStage("terminated");
          terminationObservationHandledRef.current = true;
          assessmentSaveLockRef.current = true;
          openAssessmentSaveModal(terminalSession);
          void publishAssessmentRealtimeState(code, terminalSession);
          return data;
        }

        if (
          data.session &&
          !data.stale &&
          String(data.session.stage || "") === "story_choice" &&
          latestSessionRef.current?.stage === "story_choice"
        ) {
          const nextSession = {
            ...latestSessionRef.current,
            ...data.session,
            connected:
              data.session.connected ??
              latestSessionRef.current?.connected ??
              true,
          };

          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = String(
            nextSession.stage || ""
          );
          latestSessionVersionRef.current = Date.now();
          setSession(nextSession);
          setActiveStage(nextSession.stage);

          // The final Word Recognition answer advances the server to
          // story_choice. Publish that exact response immediately so the
          // learner never remains on Word 10 while the teacher has moved on.
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: nextSession,
          });
          void publishAssessmentRealtimeState(code, nextSession);
        }
        return data;
      })().catch((saveError) => {
        console.warn("Final Word Recognition save failed:", saveError);
        return null;
      });
      finalWordSavePromiseRef.current = finalWordSavePromise;
    };

  const recordComprehension =
    async (isCorrect) => {
      const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);
      const currentIndex = questionIndex;
      const lockKey =
        "comprehension:" + currentIndex;

      if (
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current ||
        answerRestraintPending
      ) {
        return;
      }

      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);
      setTransitionPending(true);
      pendingAnswerRef.current = true;

      try {
        /*
         * Comprehension answers used to rely on the IndexedDB queue alone -
         * the same path that was already observed silently dropping word
         * results. Persist directly first (like letters and words do), keep the
         * teacher's own journal, and fall back to the queue only if the direct
         * write fails. A recorded answer must never depend on a later flush.
         */
        const nextComprehension = recordComprehensionResult({
          questionIndex: currentIndex,
          isCorrect: Boolean(isCorrect),
        });

        void persistPassageDraft({
          comprehension: nextComprehension,
        }).catch(() => {});

        comprehensionPersistPromiseRef.current = (async () => {
          const saved = await persistAnswerWithRetry("record_comprehension", {
            code,
            question_index: currentIndex,
            is_correct: Boolean(isCorrect),
            persist_only: true,
          });

          if (!saved) {
            await queueAnswerForBackgroundSave("record_comprehension", {
              code,
              question_index: currentIndex,
              is_correct: Boolean(isCorrect),
            });
          }

          return saved;
        })();

        const answerSession = {
          ...(latestSessionRef.current || {}),
          comprehensionResults: nextComprehension,
        };

        const nextIndex = currentIndex + 1;

        if (nextIndex < currentQuestions.length) {
          const nextQuestion = currentQuestions[nextIndex];
          const previousQuestion = currentQuestions[currentIndex];
          const nextSession = {
            ...answerSession,
            stage: "comprehension",
            current_content: nextQuestion.text,
            currentContent: nextQuestion.text,
          };

          questionIndexRef.current = nextIndex;
          setQuestionIndex(nextIndex);
          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = "comprehension";
          latestSessionVersionRef.current = Date.now();
          setSession(nextSession);
          setActiveStage("comprehension");
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: nextSession,
          });
          void publishAssessmentRealtimeState(code, nextSession);

          void (async () => {
          try {
            const response = await fetch(
              "/api/assessment?action=host_update",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  action: "host_update",
                  code,
                  stage: "comprehension",
                  currentContent: nextQuestion.text,
                  storyTitle:
                    nextSession.story_title || "Para the Parrot",
                  expected_stage: "comprehension",
                  expected_current_content: previousQuestion?.text || "",
                  item_index: nextIndex,
                }),
              }
            );
            const data = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(data?.error || "host update failed");
            }
            if (
              data?.session &&
              !data?.stale &&
              String(data.session.stage || "") === "comprehension"
            ) {
              const current = latestSessionRef.current;
              const incomingSession = {
                ...current,
                ...data.session,
                current_content:
                  data.session.current_content ??
                  data.session.currentContent ??
                  current?.current_content,
                currentContent:
                  data.session.current_content ??
                  data.session.currentContent ??
                  current?.currentContent,
                connected:
                  data.session.connected ??
                  current?.connected ??
                  true,
              };
              const monotonicSession = mergeMonotonicTeacherSession(
                current,
                incomingSession
              );
              if (monotonicSession !== current) {
                latestSessionRef.current = monotonicSession;
                latestActiveStageRef.current = "comprehension";
                void publishAssessmentRealtimeState(code, monotonicSession);
              }
            }
          } catch {
            await putMutation({
              id: `stage:comprehension:${String(code).toUpperCase()}:${nextIndex}`,
              action: "host_update",
              payload: {
                code,
                stage: "comprehension",
                currentContent: nextQuestion.text,
                storyTitle:
                  nextSession.story_title || "Para the Parrot",
                expected_stage: "comprehension",
                expected_current_content: previousQuestion?.text || "",
                item_index: nextIndex,
              },
              createdAt: Date.now(),
            });
          }
          })();
        } else {
          /*
           * The final review scores comprehension from server metrics, so every
           * answer must be durable before the assessment leaves this stage.
           * Waiting here is what stops a lagging background write from being
           * read back as 0/6 in the review overlay.
           */
          await Promise.all([
            comprehensionPersistPromiseRef.current.catch(() => null),
            comprehensionSavePromiseRef.current.catch(() => false),
          ]);

          const previousQuestion = currentQuestions[currentIndex];
          const experienceSession = {
            ...answerSession,
            stage: "learner_experience",
            ended: false,
            connected: true,
            current_content: "LEARNER_EXPERIENCE",
            currentContent: "LEARNER_EXPERIENCE",
          };

          assessmentSaveLockRef.current = false;
          terminationObservationHandledRef.current = false;

          latestSessionRef.current = experienceSession;
          latestActiveStageRef.current = "learner_experience";
          latestSessionVersionRef.current = Date.now();
          setSession(experienceSession);
          setActiveStage("learner_experience");
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: experienceSession,
          });
          void publishAssessmentRealtimeState(code, experienceSession);

          try {
            const response = await fetchWithTimeout(
              "/api/assessment?action=host_advance",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  action: "host_advance",
                  code,
                  stage: "learner_experience",
                  currentContent: "LEARNER_EXPERIENCE",
                  storyTitle:
                    latestSessionRef.current?.story_title || "",
                  expected_stage: "comprehension",
                  expected_current_content: previousQuestion?.text || "",
                }),
              }
            );
            const data = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(
                data?.error || "Unable to advance to learner experience."
              );
            }
            const serverSession =
              data?.session && !data?.stale
                ? {
                    ...latestSessionRef.current,
                    ...data.session,
                    stage: "learner_experience",
                    current_content:
                      data.session.current_content ??
                      data.session.currentContent ??
                      "LEARNER_EXPERIENCE",
                    currentContent:
                      data.session.current_content ??
                      data.session.currentContent ??
                      "LEARNER_EXPERIENCE",
                    connected: data.session.connected ?? true,
                    ended: false,
                  }
                : experienceSession;
            const currentSession = latestSessionRef.current;
            const authoritativeSession = mergeMonotonicTeacherSession(
              currentSession,
              serverSession
            );
            if (authoritativeSession !== currentSession) {
              latestSessionRef.current = authoritativeSession;
              latestActiveStageRef.current = authoritativeSession.stage;
              setSession(authoritativeSession);
              setActiveStage(authoritativeSession.stage);
              publishAssessmentState(assessmentChannelRef.current, {
                source: "teacher",
                session: authoritativeSession,
              });
              void publishAssessmentRealtimeState(code, authoritativeSession);
            }
          } catch {
            await putMutation({
              id: `stage:learner_experience:${String(code).toUpperCase()}`,
              action: "host_advance",
              payload: {
                code,
                stage: "learner_experience",
                currentContent: "LEARNER_EXPERIENCE",
                storyTitle: latestSessionRef.current?.story_title || "",
                expected_stage: "comprehension",
                expected_current_content: previousQuestion?.text || "",
              },
              createdAt: Date.now(),
            });
            const currentSession = latestSessionRef.current;
            const retrySession = mergeMonotonicTeacherSession(
              currentSession,
              experienceSession
            );
            if (retrySession !== currentSession) {
              latestSessionRef.current = retrySession;
              latestActiveStageRef.current = retrySession.stage;
              setSession(retrySession);
              setActiveStage(retrySession.stage);
              publishAssessmentState(assessmentChannelRef.current, {
                source: "teacher",
                session: retrySession,
              });
              void publishAssessmentRealtimeState(code, retrySession);
            }
          }
        }
      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(recordError.message || "Unable to record result.");
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
        setTransitionPending(false);
      }
    };

  const saveLearnerExperienceRating =
    async (rating) => {
      if (
        savingExperienceRating ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return;
      }

      setSelectedExperienceRating(rating);
      setSavingExperienceRating(true);
      setError("");

      /*
       * Synchronous guard. `savingExperienceRating` is React state, so two taps
       * inside one render both passed it and the second submission was rejected
       * by the server's stage guard - showing the teacher an error for a rating
       * that had actually been recorded.
       */
      if (experienceRatingInFlightRef.current) {
        return;
      }
      experienceRatingInFlightRef.current = true;

      try {
        /*
         * Never submit a comprehension snapshot that is behind the teacher's own
         * journal: this request rewrites the stored comprehension rows.
         */
        await Promise.all([
          comprehensionPersistPromiseRef.current.catch(() => null),
          comprehensionSavePromiseRef.current.catch(() => false),
        ]);

        const response = await fetch(
          "/api/assessment?action=save_experience_rating",
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              action: "save_experience_rating",
              code,
              learner_id: learnerId,
              experience_rating: rating,
              comprehension_results: comprehensionSnapshot(),
              passage_miscues:
                passageDraftRef.current.miscues || [],
              timer_seconds:
                Math.round(Number(passageDraftRef.current.timerSeconds || 0)),
            }),
          }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error || "Unable to save the learner experience rating."
          );
        }

        const reviewSession = {
          ...(latestSessionRef.current || {}),
          stage: "teacher_review",
          current_content: "TEACHER_REVIEW",
          currentContent: "TEACHER_REVIEW",
          ended: false,
          connected: true,
          metrics: {
            ...(latestSessionRef.current?.metrics || {}),
            ...(data.scoring || {}),
            passageMiscues:
              passageDraftRef.current.miscues || [],
            experienceRating: rating,
          },
        };
        latestSessionRef.current = reviewSession;
        latestActiveStageRef.current = "teacher_review";
        latestSessionVersionRef.current = Date.now();
        setSession(reviewSession);
        setActiveStage("teacher_review");
        terminationObservationHandledRef.current = true;
        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: reviewSession,
        });
        void publishAssessmentRealtimeState(code, reviewSession);
        openAssessmentSaveModal(reviewSession);
      } catch (ratingError) {
        setSelectedExperienceRating(null);
        setError(
          ratingError?.message ||
            "Unable to save the learner experience rating."
        );
      } finally {
        experienceRatingInFlightRef.current = false;
        setSavingExperienceRating(false);
      }
    };

  const finalize =
    async () => {
      setBusy(
        true
      );

      try {
        const response =
          await fetch(
            "/api/assessment?action=finalize",
            {
              method:
                "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  action:
                    "finalize",
                  code,
                  learner_id:
                    learnerId,
                  period,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to finalize assessment."
          );
        }

        const finalSession = {
          ...(latestSessionRef.current || {}),
          code,
          stage: "completed",
          ended: true,
          connected: false,
          metrics: {
            ...(latestSessionRef.current?.metrics || {}),
            ...(data.scoring || {}),
            classification:
              data.classification ||
              latestSessionRef.current?.metrics?.classification,
          },
        };

        latestSessionRef.current = finalSession;
        latestActiveStageRef.current = "completed";
        setSession(finalSession);
        setActiveStage("completed");
        terminationObservationHandledRef.current = true;
        openAssessmentSaveModal(finalSession);
        void publishAssessmentRealtimeState(code, finalSession);
      } catch (finalizeError) {
        setError(
          finalizeError.message ||
            "Unable to finalize assessment."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  const saveTerminationObservation = useCallback(
    async () => {
      if (finalReviewSaveInFlightRef.current) return;

      finalReviewSaveInFlightRef.current = true;
      setSavingTerminationObservation(true);
      setTerminationObservationError("");

      const observationLevel = Number(finalObservationLevel);
      const remarks = terminationRemarks.trim();
      const isPart1Termination =
        latestSessionRef.current?.stage === "terminated" ||
        ["ZERO_SCORE_PART1_TASK1", "PART1_TOTAL_LOW"].includes(
          latestSessionRef.current?.current_content
        );

      /*
       * Remind instead of refusing silently. This button used to be disabled
       * while the Observation Level was empty, so pressing it did nothing and
       * explained nothing; the teacher had no way to know what was missing.
       */
      if (!isPart1Termination && ![1, 2, 3, 4].includes(observationLevel)) {
        finalReviewSaveInFlightRef.current = false;
        setSavingTerminationObservation(false);
        setTerminationObservationError(
          "Select an Observation Level (1-4) before saving this assessment."
        );
        return;
      }
      const isZeroScoreTermination =
        latestSessionRef.current?.current_content === "ZERO_SCORE_PART1_TASK1";
      const currentMetrics = latestSessionRef.current?.metrics || {};
      /*
       * Only ever submit this assessment's own journal. A journal left over
       * from another code must not leak answers into this record.
       */
      const part1Journal =
        part1ResultsDraftRef.current?.code === code
          ? part1ResultsDraftRef.current
          : { code, task1Results: [], task2Results: [] };
      const task1Results = mergeReviewTaskResults(
        latestSessionRef.current?.task1Results,
        part1Journal.task1Results
      );
      const task2Results = mergeReviewTaskResults(
        latestSessionRef.current?.task2Results,
        part1Journal.task2Results
      );
      // Prefer the journal that is actually submitted over server metrics that
      // a lagging background write may not have refreshed yet.
      const hasCompleteSubmittedPart1 =
        task1Results.length >= LETTERS.length &&
        task2Results.length >= WORDS.length;
      const task1Score = hasCompleteSubmittedPart1
        ? task1Results.filter((item) => item.isCorrect === true).length
        : Number(currentMetrics.task1Score ?? task1Results.filter((item) => item.isCorrect).length ?? 0);
      const task2Score = hasCompleteSubmittedPart1
        ? task2Results.filter((item) => item.isCorrect === true).length
        : Number(currentMetrics.task2Score ?? task2Results.filter((item) => item.isCorrect).length ?? 0);
      const readingProfile = getScoresheetReadingProfile(
        task1Score + task2Score,
        currentMetrics.readingAccuracy ?? currentMetrics.miscueAccuracy ?? Math.max(0, 100 - Number(currentMetrics.totalMiscues || 0)),
        currentMetrics.comprehensionScore ?? latestSessionRef.current?.comprehensionResults?.filter((item) => item.isCorrect).length ?? 0
      );

      try {
        // The review can open optimistically as soon as the last Part 1 answer
        // is clicked. Wait for either boundary write before submitting the
        // snapshot so one press of Save always contains every recorded item.
        await finalLetterSavePromiseRef.current;
        await finalWordSavePromiseRef.current;
        await part1ResultsSavePromiseRef.current;
        /*
         * Same rule for Part 2: the saved record is built from this snapshot, so
         * a queued comprehension write must land before the review is submitted.
         */
        await Promise.all([
          comprehensionPersistPromiseRef.current.catch(() => null),
          comprehensionSavePromiseRef.current.catch(() => false),
        ]);

        const response = await fetch("/api/assessment?action=save_final_assessment_review", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "save_final_assessment_review",
            code,
            observation_level: isPart1Termination ? null : observationLevel,
            remarks,
            zero_score_termination: isZeroScoreTermination,
            part1_stop_termination: isPart1Termination,
            task1_results: task1Results,
            task2_results: task2Results,
            passage_miscues: passageDraftRef.current.miscues || [],
            comprehension_results: comprehensionSnapshot(),
            timer_seconds:
              Math.round(Number(passageDraftRef.current.timerSeconds || 0)),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          // Keep the friendly message first so the existing UX wording is
          // stable, then append the HTTP status so a rejected save is
          // diagnosable instead of repeating a generic failure.
          throw new Error(
            data?.error
              ? `${data.error} (HTTP ${response.status})`
              : `Unable to save the final assessment review. (HTTP ${response.status})`
          );
        }

        latestSessionRef.current = {
          ...(latestSessionRef.current || {}),
          stage: "completed",
          ended: true,
          connected: false,
          metrics: {
            ...(latestSessionRef.current?.metrics || {}),
            ...(data.metrics || {}),
            classification: data.classification || readingProfile,
            observationLevel: isPart1Termination ? null : observationLevel,
            remarks,
            experienceRating: data.experienceRating ?? latestSessionRef.current?.metrics?.experienceRating ?? null,
          },
        };
        latestActiveStageRef.current = "completed";
        setSession(latestSessionRef.current);
        setActiveStage("completed");
        setShowTerminationObservation(false);
        assessmentSaveLockRef.current = false;
        setTerminationObservationError("");

        void publishAssessmentRealtimeState(code, latestSessionRef.current);
        await saveAssessmentState(`final-review:${String(code).toUpperCase()}`, {
          code,
          saved: true,
          metrics: latestSessionRef.current.metrics,
        });
        window.location.replace("/teacher?tab=conduct");
      } catch (error) {
        // Re-enable the button only after a real failure so a teacher can
        // retry. A successful submission keeps the synchronous lock until the
        // dashboard navigation replaces this page.
        finalReviewSaveInFlightRef.current = false;
        setTerminationObservationError(error?.message || "Unable to save the assessment.");
        setSavingTerminationObservation(false);
      }
    },
    [code, finalObservationLevel, savingTerminationObservation, terminationRemarks]
  );

  const endSession =
    async () => {
      if (busy) {
        return;
      }

      setConfirmEndSession(
        true
      );
    };

  const confirmEndSessionAction =
    async () => {
      if (busy) {
        return;
      }

      setConfirmEndSession(
        false
      );
      setBusy(
        true
      );
      setError("");

      try {
        const response =
          await fetch(
            "/api/assessment?action=host_end",
            {
              method:
                "POST",
              credentials:
                "include",
              cache:
                "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body:
                JSON.stringify({
                  action:
                    "host_end",
                  code,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to end session."
          );
        }

        const endedSession = {
          ...(data?.session || latestSessionRef.current || {}),
          code,
          stage: "ended",
          current_content: "Assessment session ended by teacher.",
          currentContent: "Assessment session ended by teacher.",
          ended: true,
          connected: false,
        };

        latestSessionRef.current = endedSession;
        latestActiveStageRef.current = "ended";
        setSession(endedSession);
        setActiveStage("ended");
        setAnswerLockKey("");
        answerActionLockRef.current = "";
        pendingAnswerRef.current = false;
        assessmentSaveLockRef.current = false;

        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: endedSession,
        });
        void publishAssessmentRealtimeState(code, endedSession);

        try {
          localStorage.removeItem(
            "crla_host_session"
          );
        } catch {
          /* Storage may be unavailable. */
        }

        await new Promise((resolve) => window.setTimeout(resolve, 400));

        /*
         * Ending the teacher controller does not complete
         * the BoSY/MoSY/EoSY assessment.
         */
        window.location.replace(
          "/teacher?tab=conduct"
        );
      } catch (endError) {
        setError(
          endError.message ||
            "Unable to end session."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  if (loading) {
    return (
      <main style={styles.page}>
        {/*
          Bare spinner only. The dashboard shows the "Starting Assessment"
          overlay for this same action, so a titled card here duplicated it.
        */}
        <div
          role="status"
          aria-label="Starting assessment"
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "60vh",
          }}
        >
          <div style={styles.spinner} />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.page}>
        <div
          style={{
            ...styles.card,
            maxWidth: 520,
          }}
        >
          <h1
            style={styles.title}
          >
            Assessment Error
          </h1>

          <p
            style={
              styles.muted
            }
          >
            {error}
          </p>

          <button
            type="button"
            style={
              styles.primary
            }
            onClick={() =>
              window.location.replace(
                "/teacher?tab=conduct"
              )
            }
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <style>{`
        @keyframes crlAssessmentSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes crlModalFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes crlAssessmentContentIn {
          from {
            opacity: 0;
            transform: translateY(7px) scale(.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .crlIntroLayout {
          width: 100%;
        }

        /*
         * Keep the intro cards mounted and use GPU-friendly opacity/transform
         * transitions instead of clip-path/scale animations. This makes the
         * learner-connection transition feel smooth and avoids the "snap /
         * bounce / jitter" visible in the previous recording.
         */
        .crlIntroLayout {
          width: 100%;
        }

        /*
         * Connected-state transition
         * --------------------------
         * Keep one fixed outer frame for the entire transition. The waiting
         * state uses a 32% / 68% split. When the learner connects, the first
         * track smoothly contracts to zero while the assessment track grows
         * leftward into the exact same frame.
         *
         * Because the assessment card remains in grid column 2 in both states,
         * its contents move/resize naturally with the animated track instead
         * of being remounted in a different layout. The connected status is
         * its own grid row, so it never changes the assessment card's
         * final dimensions.
         */
        /*
         * Connection transition
         * ----------------------
         * Keep the assessment workspace itself stable. The code card is an
         * absolute left-hand panel and the assessment card reserves the
         * remaining space with a margin/width pair. On connection those
         * dimensions animate to zero/100%, creating the requested leftward
         * expansion without changing the page's underlying structure.
         *
         * The learner-connected banner is a separate normal-flow block, so
         * it can never overlap the assessment card.
         */
        .crlIntroLayoutWaiting,
        .crlIntroLayoutJoined {
          position: relative;
          width: 100%;
          margin-top: 20px;
          margin-bottom: 22px;
          min-width: 0;
          box-sizing: border-box;
        }

        .crlIntroLayoutWaiting .crlIntroCodeCard,
        .crlIntroLayoutJoined .crlIntroCodeCardJoined {
          position: absolute;
          top: 0;
          left: 0;
          width: 32%;
          height: 100%;
          min-width: 0;
          box-sizing: border-box;
          overflow: hidden;
          z-index: 4;
          pointer-events: none;
          backface-visibility: hidden;
          transform: translateZ(0);
        }

        .crlIntroLayoutWaiting .crlIntroCodeCard {
          opacity: 1;
          clip-path: inset(0 0 0 0);
          transform: translate3d(0,0,0);
        }

        .crlIntroLayoutJoined .crlIntroCodeCardJoined {
          animation:
            crlIntroCodeWipe .96s cubic-bezier(.16,1,.3,1) both;
        }

        .crlIntroLayoutWaiting .crlIntroAssessmentCard,
        .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
          position: relative;
          display: block;
          width: calc(68% - 11px);
          margin-left: calc(32% + 11px);
          min-width: 0;
          max-width: none;
          box-sizing: border-box;
          z-index: 1;
          opacity: 1;
          transform: translate3d(0,0,0);
          transition:
            width 1.05s cubic-bezier(.16,1,.3,1),
            margin-left 1.05s cubic-bezier(.16,1,.3,1),
            box-shadow .65s cubic-bezier(.16,1,.3,1);
        }

        .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
          width: 100%;
          margin-left: 0;
        }

        @keyframes crlIntroCodeWipe {
          0% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
            transform: translate3d(0,0,0);
          }
          18% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            clip-path: inset(0 100% 0 0);
            transform: translate3d(-10px,0,0);
          }
        }

        .crlIntroConnectedCard {
          width: 100%;
          min-height: 0;
          max-height: 0;
          margin: 0;
          padding: 0 20px;
          overflow: hidden;
          box-sizing: border-box;
          opacity: 0;
          transform: translate3d(0,-12px,0) scale(.97);
          transform-origin: center center;
        }

        .crlIntroConnectedCard.crlIntroConnectedCardVisible {
          max-height: 68px;
          margin:
            18px 0 0;
          padding: 14px 20px;
          opacity: 1;
          transform: translate3d(0,0,0) scale(1);
          animation:
            crlIntroConnectedPop .78s cubic-bezier(.16,1,.3,1) both;
          animation-delay: .70s;
        }

        @keyframes crlIntroConnectedPop {
          0% {
            opacity: 0;
            transform:
              translate3d(0,-12px,0)
              scale(.97);
          }
          45% {
            opacity: .55;
          }
          78% {
            opacity: 1;
            transform:
              translate3d(0,1px,0)
              scale(1.006);
          }
          100% {
            opacity: 1;
            transform:
              translate3d(0,0,0)
              scale(1);
          }
        }

        @media (max-width: 900px) {
          .crlIntroLayoutWaiting,
          .crlIntroLayoutJoined {
            margin-top: 18px;
            margin-bottom: 18px;
          }

          .crlIntroLayoutWaiting .crlIntroCodeCard,
          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            position: relative;
            width: 100%;
            height: auto;
            min-height: 0;
            margin: 0;
          }

          .crlIntroLayoutWaiting .crlIntroAssessmentCard,
          .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
            width: 100%;
            margin-left: 0;
            margin-top: 18px;
          }

          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            height: 0;
            min-height: 0;
          }

          .crlIntroConnectedCard.crlIntroConnectedCardVisible {
            max-height: 68px;
            margin-top: 18px;
            padding: 14px 16px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            animation: none !important;
            opacity: 0 !important;
          }

          .crlIntroLayoutWaiting .crlIntroAssessmentCard,
          .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
            transition-duration: .01ms !important;
          }

          .crlIntroConnectedCard.crlIntroConnectedCardVisible {
            animation: none !important;
            max-height: 78px;
            opacity: 1;
            transform: none !important;
          }
        }

        .crlAnswerButton:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.04);
          box-shadow: none;
        }

        .crlAnswerButton:active:not(:disabled) {
          transform: translateY(1px) scale(.985);
          box-shadow: none;
        }

        .crlComprehensionAnswerButton:disabled,
        .successButton:disabled,
        .dangerButton:disabled {
          cursor: not-allowed !important;
          opacity: .52 !important;
          filter: grayscale(.18) !important;
          transform: none !important;
          box-shadow: none;
        }

        .crlAnswerButton:disabled {
          cursor: not-allowed !important;
          opacity: .62;
          filter: grayscale(.08);
          box-shadow: none;
        }

        .crlStartReadingButton {
          transition:
            transform .16s ease,
            filter .16s ease,
            box-shadow .16s ease;
        }

        .crlStartReadingButton:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.06);
          box-shadow: none;
        }

        .crlStartReadingButton:active:not(:disabled) {
          transform: translateY(1px) scale(.98);
          box-shadow: none;
        }

        .crlOmissionWord {
          position: relative;
          display: inline-block;
        }

        .crlOmissionWord::after {
          content: "";
          position: absolute;
          left: -2px;
          right: -2px;
          top: 52%;
          height: 3px;
          border-radius: 999px;
          background: #d9534f;
          transform: translateY(-50%) rotate(-18deg);
          transform-origin: center;
          pointer-events: none;
        }

        .crlPassageWord:hover {
          background: #edf1f7 !important;
          color: #1a2b4c !important;
          box-shadow: none;
          transform: translateY(-1px);
        }

        .crlPassageWord:focus-visible {
          outline: 3px solid #7f9dc4;
          outline-offset: 2px;
        }

        @keyframes crlModalIn {
          from {
            opacity: 0;
            transform: translateY(6px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Mobile and tablet optimization for the live teacher assessment */
        .teacherAssessmentPage {
          overflow-x: hidden;
        }

        @media (max-width: 900px) {
          .teacherAssessmentPage {
            padding: 14px !important;
          }

          .teacherAssessmentPage > div {
            max-width: 760px !important;
          }

          .teacherAssessmentPage > div > header {
            min-height: 64px !important;
            padding: 10px 14px !important;
          }

          .teacherAssessmentPage > div > section {
            width: 100% !important;
          }

          .teacherAssessmentPage [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 640px) {
          .teacherAssessmentPage {
            padding: 9px !important;
          }

          .teacherAssessmentPage > div > header {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }

          .teacherAssessmentPage > div > header button {
            width: 100% !important;
          }

          .teacherAssessmentPage [style*="fontSize: \"38px\""] {
            font-size: 30px !important;
          }

          .teacherAssessmentPage [style*="fontSize: \"96px\""] {
            min-height: 180px !important;
            font-size: 68px !important;
          }

          .teacherAssessmentPage [style*="padding: \"26px\""] {
            padding: 18px !important;
          }

          .teacherAssessmentPage [style*="padding: \"20px\""] {
            padding: 16px !important;
          }

          .teacherAssessmentPage [style*="maxWidth: \"760px\""] {
            max-width: 100% !important;
          }

          .teacherAssessmentPage [style*="maxWidth: \"700px\""] {
            max-width: 100% !important;
          }

          .teacherAssessmentPage [style*="minHeight: \"130px\""] {
            min-height: 110px !important;
            padding: 18px !important;
            font-size: 18px !important;
          }

          .teacherAssessmentPage [style*="maxWidth: \"430px\""] {
            max-width: 100% !important;
          }

          .teacherAssessmentPage input,
          .teacherAssessmentPage select,
          .teacherAssessmentPage textarea,
          .teacherAssessmentPage button {
            min-height: 44px;
          }

          .teacherAssessmentPage textarea {
            min-height: 100px !important;
          }

          .teacherAssessmentPage [style*="gridTemplateColumns: \"90px 1fr 1fr\""] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 420px) {
          .teacherAssessmentPage {
            padding: 6px !important;
          }

          .teacherAssessmentPage > div > section {
            border-radius: 10px !important;
          }

          .teacherAssessmentPage [style*="fontSize: \"68px\""] {
            font-size: 58px !important;
          }

          .teacherAssessmentPage [style*="letterSpacing: \"8px\""] {
            letter-spacing: 5px !important;
          }
        }

        @media (max-width: 900px) {
          .teacherAssessmentPage {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
        }

        @media (max-width: 720px) {
          .teacherAssessmentPage header {
            flex-wrap: wrap !important;
            align-items: flex-start !important;
          }

          .teacherAssessmentPage header > div:first-child {
            min-width: 0 !important;
            flex: 1 1 100% !important;
          }

          .teacherAssessmentPage header button {
            margin-left: auto !important;
          }
        }

        @media (max-width: 720px) {
          .teacherAssessmentPage header {
            align-items: flex-start !important;
            flex-wrap: wrap !important;
          }

          .teacherAssessmentPage header > div:first-child {
            min-width: 0 !important;
            flex: 1 1 100% !important;
          }

          .teacherAssessmentPage header button {
            margin-left: auto !important;
          }
        }

        /* Final alignment pass: the header and assessment workspace
           must share one exact responsive width boundary. */
        .teacherAssessmentPage > div {
          width: 100% !important;
          max-width: 1180px !important;
          box-sizing: border-box !important;
        }

        .teacherAssessmentPage > div > header {
          width: 100% !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutWaiting,
        .crlIntroLayoutJoined {
          width: 100% !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutWaiting .crlIntroCodeCard,
        .crlIntroLayoutJoined .crlIntroCodeCardJoined {
          width: 32% !important;
          min-width: 0 !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutWaiting .crlIntroAssessmentCard {
          width: calc(68% - 11px) !important;
          margin-left: calc(32% + 11px) !important;
          min-width: 0 !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
          width: 100% !important;
          margin-left: 0 !important;
          min-width: 0 !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        /*
         * The desktop alignment rules above intentionally use !important.
         * Re-assert the mobile stack after them so those desktop widths cannot
         * squeeze the code card to 32% or offset the stage card off-screen.
         */
        @media (max-width: 900px) {
          .crlIntroLayoutWaiting .crlIntroCodeCard {
            position: relative !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
          }

          .crlIntroLayoutWaiting .crlIntroAssessmentCard {
            width: 100% !important;
            margin-left: 0 !important;
            margin-top: 16px !important;
          }

          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
            width: 100% !important;
            margin-left: 0 !important;
            margin-top: 0 !important;
          }
        }

        @media (max-width: 640px) {
          .crlAssessmentCode {
            max-width: 100%;
            font-size: clamp(32px, 12vw, 44px) !important;
            letter-spacing: clamp(3px, 1.8vw, 7px) !important;
            white-space: nowrap;
          }

          .crlIntroWaitingPanel {
            min-height: 320px !important;
            padding: 48px 22px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      {/* CRL_MISCUE_MARKING_REPAIR */}

      <main className="teacherAssessmentPage" style={styles.page}>
      <div
        style={styles.container}
      >
        <header
          style={
            styles.header
          }
        >
          <div>
            <div
              style={
                styles.headerSub
              }
            >
              {period} Assessment for{" "}
              {stableLearnerDisplayName || "Learner"}
            </div>
          </div>

          <button
            type="button"
            style={
              joined
                ? styles.endSessionButton
                : styles.backDashboardButton
            }
            onClick={
              joined
                ? endSession
                : () =>
                    window.location.replace(
                      "/teacher?tab=conduct"
                    )
            }
            disabled={
              joined &&
              busy
            }
          >
            {joined
              ? "End Session"
              : "Back to Dashboard"}
          </button>
        </header>

        <div
          className={
            joined
              ? "crlIntroConnectedCard crlIntroConnectedCardVisible"
              : "crlIntroConnectedCard"
          }
          style={styles.connectedStatusCard}
        >
          <span
            style={{
              ...styles.dot,
              background: "#3e7a5e",
            }}
          />
          Learner connected
        </div>

        <div
          className={
            joined
              ? "crlIntroLayout crlIntroLayoutJoined"
              : "crlIntroLayout crlIntroLayoutWaiting"
          }
        >
          <section
            className={
              joined
                ? "crlIntroCodeCard crlIntroCodeCardJoined"
                : "crlIntroCodeCard"
            }
            aria-hidden={
              joined
            }
            style={
              styles.codeCard
            }
          >
            <div
              style={
                styles.codeLabel
              }
            >
              Assessment Code
            </div>

            <div
              className="crlAssessmentCode"
              style={
                styles.code
              }
            >
              {code}
            </div>

            <div
              style={
                styles.connectionStatus
              }
            >
              <span
                style={{
                  ...styles.dot,
                  background:
                    "#a9762f",
                }}
              />

              Waiting for learner to connect
            </div>
          </section>

          <section
            className={
              joined
                ? "crlIntroAssessmentCard crlIntroAssessmentCardJoined"
                : "crlIntroAssessmentCard"
            }
            style={
              styles.assessmentCard
            }
          >
            {activeStage !== "passage" && (
<div
              style={
                styles.stageHeader
              }
            >
              <div>
                <div
                  style={
                    styles.smallLabel
                  }
                >
                  Current Stage
                </div>

                <h1
                  style={
                    styles.title
                  }
                >
                  {activeStage ===
                  "waiting"
                    ? "Waiting"
                    : activeStage ===
                      "letter"
                    ? "Task 1: Letter Sounds"
                    : activeStage ===
                      "word"
                    ? "Task 2: Word Recognition"
                    : activeStage ===
                      "story_choice"
                    ? "Part 2: Choose Story"
                    : activeStage ===
                      "passage"
                    ? "Part 2: Passage Reading"
                    : activeStage ===
                      "comprehension"
                    ? "Comprehension"
                    : activeStage ===
                      "learner_experience"
                    ? "Learner Experience"
                    : activeStage ===
                      "teacher_review"
                    ? "Teacher Review"
                    : activeStage ===
                      "completed"
                    ? "Completed"
                    : activeStage ===
                      "terminated"
                    ? "Terminated"
                    : activeStage}
                </h1>
              </div>
            </div>

            )}

            {!joined ? (
              <div
                className="crlIntroWaitingPanel"
                style={
                  styles.waitingPanel
                }
              >
                <div
                  style={
                    styles.waitingCircle
                  }
                >
                  …
                </div>

                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Waiting for learner
                </h2>

                <p
                  style={
                    styles.muted
                  }
                >
                  On the learner device, open
                  the Learner App and enter the
                  six-character assessment code
                  shown above.
                </p>
              </div>
            ) : (
              <div
                style={
                  styles.stagePanel
                }
              >
                {activeStage ===
                  "letter" && (
                  <>
                    <div
                      style={
                        styles.counter
                      }
                    >
                      Letter{" "}
                      {letterIndex +
                        1}{" "}
                      of{" "}
                      {
                        LETTERS.length
                      }
                    </div>

                    <div
                      key={`letter-${letterIndex}-${session?.current_content ?? ""}`}
                      style={{
                        ...styles.contentDisplay,
                        animation:
                          "crlAssessmentContentIn .2s ease-out",
                      }}
                    >
                      {
                        LETTERS[
                          letterIndex
                        ]
                      }
                    </div>

                    <div
                      style={
                        styles.answerButtons
                      }
                    >
                      <button
                        type="button"
                        className="crlAnswerButton crlComprehensionAnswerButton"
                        style={
                          styles.successButton
                        }
                        disabled={
                          busy ||
                          answerRestraintPending ||
                          answerLockKey ===
                            ("letter:" +
                              letterIndex)
                        }
                        onClick={() =>
                          recordLetter(
                            true
                          )
                        }
                      >
                        Correct
                      </button>

                      <button
                        type="button"
                        className="crlAnswerButton crlComprehensionAnswerButton"
                        style={
                          styles.dangerButton
                        }
                        disabled={
                          busy ||
                          answerRestraintPending ||
                          answerLockKey ===
                            ("letter:" +
                              letterIndex)
                        }
                        onClick={() =>
                          recordLetter(
                            false
                          )
                        }
                      >
                        Incorrect
                      </button>
                    </div>
                  </>
                )}

                {activeStage ===
                  "word" && (
                  <>
                    <div
                      style={
                        styles.counter
                      }
                    >
                      Word{" "}
                      {wordIndex +
                        1}{" "}
                      of{" "}
                      {
                        WORDS.length
                      }
                    </div>

                    <div
                      key={`word-${wordIndex}-${session?.current_content ?? ""}`}
                      style={{
                        ...styles.contentDisplay,
                        animation:
                          "crlAssessmentContentIn .2s ease-out",
                      }}
                    >
                      {
                        WORDS[
                          wordIndex
                        ]
                      }
                    </div>

                    <div
                      style={
                        styles.answerButtons
                      }
                    >
                      <button
                        type="button"
                        className="crlAnswerButton"
                        style={
                          styles.successButton
                        }
                        disabled={
                          busy ||
                          answerRestraintPending ||
                          answerLockKey ===
                            ("word:" +
                              wordIndex)
                        }
                        onClick={() =>
                          recordWord(
                            true
                          )
                        }
                      >
                        Correct
                      </button>

                      <button
                        type="button"
                        className="crlAnswerButton"
                        style={
                          styles.dangerButton
                        }
                        disabled={
                          busy ||
                          answerRestraintPending ||
                          answerLockKey ===
                            ("word:" +
                              wordIndex)
                        }
                        onClick={() =>
                          recordWord(
                            false
                          )
                        }
                      >
                        Incorrect
                      </button>
                    </div>
                  </>
                )}

                {activeStage ===
                  "story_choice" && (
                  <div style={styles.storyChoicePanel}>
                    <div style={styles.storyChoiceGrid}>
                      {STORIES.map((story) => (
                        <div
                          key={story.id}
                          style={{
                            ...styles.storyChoiceCard,
                            cursor: story.available ? "pointer" : "default",
                          }}
                          role={story.available ? "button" : undefined}
                          tabIndex={story.available ? 0 : undefined}
                          onClick={() => {
                            if (story.available) {
                              void selectStory(story);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              story.available &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              void selectStory(story);
                            }
                          }}
                        >
                          <div style={styles.storyChoiceIcon}>
                            {String(story.title || "").toLowerCase().includes("a day in the fields") ? "🌾" : "🦜"}
                          </div>
                          <div style={styles.storyChoiceBody}>
                            <div style={styles.storyChoiceTitleSmall}>
                              {story.title}
                            </div>
                            <div style={styles.storyChoiceDescription}>
                              {story.description}
                            </div>
                          </div>
                          <button
                            type="button"
                            style={
                              story.available
                                ? styles.storyChoiceButton
                                : styles.storyChoiceButtonDisabled
                            }
                            disabled={!story.available || storySelecting || busy}
                            onClick={() => selectStory(story)}
                          >
                            {story.available
                              ? storySelecting
                                ? "Starting..."
                                : "Start Passage"
                              : "Unavailable"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeStage ===
                  "passage" && (
                  <section
                    style={styles.passageInterface}
                    aria-label="Passage reading assessment"
                  >
                    <div style={styles.passageHeader}>
                      <div>
                        <div style={styles.passageEyebrow}>
                          PART 2 · PASSAGE READING
                        </div>
                        <h2 style={styles.passageStoryTitle}>
                          {session?.story_title ||
                            "Para The Parrot"}
                        </h2>
                      </div>

                      <div
                        style={{
                          ...styles.passageStatus,
                          ...(passagePaused
                            ? styles.passageStatusPaused
                            : {}),
                        }}
                      >
                        <span
                          style={styles.passageStatusDot}
                        />
                        {passagePaused
                          ? "PAUSED"
                          : passageSeconds >= 120
                            ? "TIME LIMIT"
                            : "READING"}
                      </div>
                    </div>

                    <div style={styles.passageReadingCard}>
                      <div style={styles.passageMetaRow}>
                        <span>
                          {passageText
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .length}{" "}
                          words
                        </span>
                        <span>
                          {passageMiscues.length} miscue
                          {passageMiscues.length === 1
                            ? ""
                            : "s"}
                        </span>
                      </div>

                      <div
                        style={styles.passageText}
                        role="region"
                        aria-label="Passage text"
                      >
                        {passageWordElements}
                      </div>

                    </div>

                    <div style={styles.passageControlGrid}>
                      {(!passageHasStarted || startingPassageReading) && (
                        <div style={styles.passageFinishRow}>
                          <button type="button" className="crlStartReadingButton" style={styles.primaryPassageButton} onClick={() => void startPassageTimer()} disabled={busy || storySelecting || !passageStageConfirmed || startingPassageReading}>
                            {startingPassageReading ? (
                              <><span style={styles.startReadingSpinner} aria-hidden="true" />{waitingForLearnerPassage ? "Waiting for learner screen…" : "Starting..."}</>
                            ) : "Start Reading"}
                          </button>
                        </div>
                      )}
                      {passageHasStarted && !startingPassageReading && passageSeconds < 120 && !miscueReviewMode && (
                        <div style={styles.passageTimerCard}>
                          <div style={styles.timerIconShell}>
                            <span style={styles.timerIcon}>◷</span>
                          </div>

                          <div style={styles.timerInfo}>
                            <div style={styles.timerLabel}>
                              TIME
                            </div>

                            <div style={styles.timerValue}>
                              {String(
                                Math.floor(
                                  passageSeconds / 60
                                )
                              ).padStart(2, "0")}
                              :
                              {String(
                                passageSeconds % 60
                              ).padStart(2, "0")}
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-label={
                              passagePaused
                                ? "Resume reading"
                                : "Pause reading"
                            }
                            title={
                              passagePaused
                                ? "Resume reading"
                                : "Pause reading"
                            }
                            style={{
                              ...styles.timerIconButton,
                              ...(passagePaused
                                ? styles.timerResumeIcon
                                : styles.timerPauseIcon),
                            }}
                            onClick={() =>
                              void controlPassageTimer(
                                passagePaused
                                  ? "resume"
                                  : "pause"
                              )
                            }
                            disabled={
                              !session?.passage_started_at ||
                              passageTimerRequestRef.current
                            }
                          >
                            {passagePaused
                              ? "▶"
                              : "❚❚"}
                          </button>
                        </div>
                      )}

                      {timeUpSelecting && (
                        <div style={styles.timeoutWorkflowCard}>
                          {!timeUpReviewConfirmed ? (
                            <>
                              <div style={styles.timeoutWorkflowTitle}>
                                Review miscues
                              </div>

                              <p style={styles.timeoutWorkflowText}>
                                Click any word above only when you observed a
                                miscue. You may leave every word unchanged.
                              </p>

                              <button
                                type="button"
                                style={styles.timeoutConfirmButton}
                                onClick={() => {
                                  setTimeUpReviewConfirmed(true);
                                  setMiscueDrawerOpen(false);
                                  setSelectedPassageWord(null);
                                  setSelectedMiscueType(null);
                                  setSubstitutionInputRequested(false);
                                  setMisreadWord("");
                                }}
                              >
                                Confirm &amp; Continue
                              </button>
                            </>
                          ) : (
                            <>
                              <div style={styles.timeoutStepBadge}>
                                STEP 2
                              </div>

                              <div style={styles.timeoutWorkflowTitle}>
                                Select last word read
                              </div>

                              <p style={styles.timeoutWorkflowText}>
                                Click the last word the learner reached in
                                the passage above.
                              </p>

                              <div style={styles.lastWordValue}>
                                {passageWordsRead
                                  ? passageWordsRead
                                  : "Not selected"}
                                <span> / 100</span>
                              </div>

                              <div style={styles.timeoutWorkflowHint}>
                                This selection will finish the passage and
                                open comprehension.
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {miscueReviewMode && !timeUpSelecting && (
                        <div style={styles.miscueInlinePrompt}>
                          <div style={styles.miscueInlinePromptBadge}>REVIEW</div>
                          <div style={styles.miscueInlinePromptTitle}>Review passage miscues</div>
                          <div style={styles.miscueInlinePromptText}>
                            Optionally press any word in the original passage above where you observed a miscue. Leave every word unchanged when there are no miscues.
                          </div>
                          <button
                            type="button"
                            style={styles.miscueInlineConfirmButton}
                            onClick={() =>
                              void finishPassageReading(
                                passageSeconds,
                                passageSeconds >= 120 ? passageWordsRead || 0 : 100
                              )
                            }
                            disabled={busy || passageFinalizingRef.current}
                          >
                            Confirm & Continue
                          </button>
                        </div>
                      )}

                      {passageHasStarted && !miscueReviewMode && !timeUpSelecting && (
                        <div style={styles.passageFinishRow}>
                          <button
                            type="button"
                            style={styles.primaryPassageButton}
                            onClick={() => setConfirmFinishReading(true)}
                            disabled={
                              busy ||
                              passageFinalizingRef.current ||
                              !session?.passage_started_at
                            }
                          >
                            Finish Reading
                          </button>
                        </div>
                      )}
                    </div>

                  </section>
                )}

                {activeStage ===
                  "comprehension" && (
                  <>
                    <div
                      style={
                        styles.counter
                      }
                    >
                      Question{" "}
                      {questionIndex +
                        1}{" "}
                      of{" "}
                      {
                        currentQuestions.length
                      }
                    </div>

                    <div
                      key={`question-${questionIndex}-${session?.current_content ?? ""}`}
                      style={styles.question}
                    >
                      {
                        currentQuestion?.text
                      }
                    </div>

                    <div
                      style={
                        styles.answerButtons
                      }
                    >
                      <button
                        type="button"
                        className="crlAnswerButton crlComprehensionAnswerButton"
                        style={
                          styles.successButton
                        }
                        disabled={
                          busy ||
                          answerRestraintPending ||
                          answerLockKey ===
                            ("comprehension:" +
                              questionIndex)
                        }
                        onClick={() =>
                          recordComprehension(
                            true
                          )
                        }
                      >
                        Correct
                      </button>

                      <button
                        type="button"
                        className="crlAnswerButton crlComprehensionAnswerButton"
                        style={
                          styles.dangerButton
                        }
                        disabled={
                          busy ||
                          answerRestraintPending ||
                          answerLockKey ===
                            ("comprehension:" +
                              questionIndex)
                        }
                        onClick={() =>
                          recordComprehension(
                            false
                          )
                        }
                      >
                        Incorrect
                      </button>
                    </div>
                  </>
                )}

                {activeStage ===
                  "completed" && (
                  <div
                    style={
                      styles.waitingPanel
                    }
                  >
                    <div
                      style={{
                        ...styles.waitingCircle,
                        background:
                          "#e8f0ea",
                        color:
                          "#3e7a5e",
                      }}
                    >
                      ✓
                    </div>

                    <h2
                      style={
                        styles.sectionTitle
                      }
                    >
                      Assessment completed
                    </h2>

                    <p
                      style={
                        styles.muted
                      }
                    >
                      The results have been saved
                      to the database.
                    </p>

                    <button
                      type="button"
                      style={
                        styles.primary
                      }
                      onClick={() =>
                        window.location.replace(
                          "/teacher?tab=conduct"
                        )
                      }
                    >
                      Return to Dashboard
                    </button>
                  </div>
                )}

                {activeStage === "learner_experience" && (
                  <div style={styles.waitingPanel}>
                    <div style={{ ...styles.waitingCircle, fontSize: "30px" }}>
                      💬
                    </div>
                    <h2 style={styles.sectionTitle}>
                      Ask how the assessment felt
                    </h2>
                    <p style={styles.muted}>
                      The learner can see the same five-face scale. Select the
                      number the learner tells or points to; only this teacher
                      screen records the response.
                    </p>
                    <div
                      role="group"
                      aria-label="Record learner experience rating"
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: "10px",
                        width: "100%",
                        maxWidth: "620px",
                        marginTop: "12px",
                      }}
                    >
                      {EXPERIENCE_RATING_CHOICES.map(
                        ({ rating, emoji, label }) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() =>
                              void saveLearnerExperienceRating(rating)
                            }
                            disabled={savingExperienceRating}
                            aria-label={`${label}: ${rating} out of 5`}
                            style={{
                              flex: "1 1 82px",
                              maxWidth: "112px",
                              minHeight: "106px",
                              padding: "12px 8px",
                              border:
                                selectedExperienceRating === rating
                                  ? "3px solid #1a2b4c"
                                  : "1px solid #c7d2e0",
                              borderRadius: "16px",
                              background:
                                selectedExperienceRating === rating
                                  ? "#edf1f7"
                                  : "#ffffff",
                              color: "#2a3a55",
                              cursor: savingExperienceRating
                                ? "wait"
                                : "pointer",
                              boxShadow: "none",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{ display: "block", fontSize: "42px" }}
                            >
                              {emoji}
                            </span>
                            <strong style={{ fontSize: "18px" }}>{rating}</strong>
                          </button>
                        )
                      )}
                    </div>
                    {savingExperienceRating && (
                      <p style={styles.muted}>Saving the learner response…</p>
                    )}
                  </div>
                )}

                {activeStage ===
                  "terminated" && (
                  <div
                    style={
                      styles.waitingPanel
                    }
                  >
                    <div
                      style={{
                        ...styles.waitingCircle,
                        background:
                          "#f8eae8",
                        color:
                          "#c0392b",
                      }}
                    >
                      !
                    </div>

                    <h2 style={styles.sectionTitle}>Zero score recorded</h2>
                    <p style={styles.muted}>The remarks-only assessment review is open above.</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {reversionSelecting && reversionSourceWord && (
          <div style={styles.reversionOverlay} role="dialog" aria-modal="true" aria-labelledby="reversion-picker-title">
            <div style={styles.reversionPickerCard}>
              <div style={styles.reversionPickerHeader}>
                <div>
                  <div style={styles.miscueDrawerEyebrow}>REVERSION OBSERVATION</div>
                  <div id="reversion-picker-title" style={styles.reversionPickerTitle}>Select the word the learner reversed</div>
                  <div style={styles.miscueDrawerHint}>The original passage is masked while you select the second word. The selected first word is highlighted. Press the word that was read before the selected word, then the pair will be recorded automatically.</div>
                </div>
                <button
                  type="button"
                  style={styles.miscueDrawerClose}
                  aria-label="Cancel reversion selection"
                  onClick={() => {
                    setReversionSelecting(false);
                    setReversionSourceWord(null);
                    setSelectedPassageWord(null);
                    setSelectedMiscueType(null);
                    setError("");
                  }}
                >
                  ×
                </button>
              </div>

              <div style={styles.reversionSourceBadge}>
                Selected first word: <strong>{passageText.split(/\s+/).filter(Boolean)[Number(reversionSourceWord) - 1] || "Selected word"}</strong>
              </div>

              <div style={styles.reversionPassageMask}>
                {(() => {
                  let wordNumber = 0;
                  return passageText.split(/(\s+)/).map((token, index) => {
                    if (!token.trim()) return token;
                    const number = ++wordNumber;
                    const isSource = number === Number(reversionSourceWord);
                    const annotation = passageMiscues.find((item) => Number(item.wordIndex) === number - 1);
                    const annotationType = String(annotation?.miscueType || "");
                    const isAlreadyMiscued = Boolean(annotation);
                    const annotationColor = annotationType === "SelfCorrection" ? "#3e7a5e" : annotationType === "Reversion" ? "#a9762f" : "#d9534f";
                    const annotationMarker = annotationType === "Insertion" ? "⌃" : annotationType === "SelfCorrection" ? "✓" : annotationType === "Reversion" ? (String(annotation?.reversionOrder || "") + " " + (Number(annotation?.relatedWordIndex) >= number ? "↷" : "↶")).trim() : "";
                    const annotationTextStyle = annotationType === "Repetition" ? { textDecoration: "underline double 3px #d9534f", textUnderlineOffset: "5px" } : annotationType === "Substitution" ? { textDecoration: "underline 3px #d9534f", textUnderlineOffset: "5px" } : annotationType === "SelfCorrection" ? { textDecoration: "underline 2px #3e7a5e", textUnderlineOffset: "4px" } : {};
                    return (
                      <button
                        key={"reversion-word-" + index}
                        type="button"
                        style={{
                          ...styles.reversionWordButton,
                          ...(isSource ? styles.reversionSourceWord : {}),
                          ...(isAlreadyMiscued ? {
                            background: "transparent",
                            color: "#2a3a55",
                            borderColor: "transparent",
                            boxShadow: "none",
                            cursor: "not-allowed",
                            opacity: 1,
                          } : {}),
                        }}
                        disabled={recordingMiscue || isSource || isAlreadyMiscued}
                        onClick={() => {
                          if (isSource || isAlreadyMiscued) return;
                          void recordPassageMiscue(Number(reversionSourceWord), 'Reversion', '', number);
                        }}
                        aria-label={"Reversion word " + number + ": " + token + (isSource ? " (selected first word)" : isAlreadyMiscued ? " (already marked with a miscue)" : "")}
                        title={isAlreadyMiscued ? "Already marked: " + (annotationType === "SelfCorrection" ? "Self-Correction" : annotationType) : undefined}
                      >
                        {isSource && <span style={styles.reversionWordMarker}>1</span>}
                        {isAlreadyMiscued && annotationMarker && (
                          <span
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: annotationType === "Insertion" ? "auto" : "-14px",
                              bottom: annotationType === "Insertion" ? "-5px" : "auto",
                              left: annotationType === "Insertion" ? "1px" : "50%",
                              transform: annotationType === "Insertion" ? "none" : "translateX(-50%)",
                              color: annotationColor,
                              fontSize: annotationType === "Reversion" ? "11px" : "15px",
                              lineHeight: 1,
                              fontWeight: 950,
                              whiteSpace: "nowrap",
                              pointerEvents: "none",
                            }}
                          >
                            {annotationMarker}
                          </span>
                        )}
                        {isAlreadyMiscued && annotationType === "Substitution" && annotation?.misreadWord ? (
                          <span
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: "-24px",
                              left: "50%",
                              transform: "translateX(-50%)",
                              color: "#d9534f",
                              fontSize: "9px",
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                              pointerEvents: "none",
                            }}
                          >
                            {annotation.misreadWord}
                          </span>
                        ) : null}
                        <span
                          className={annotationType === "Omission" ? "crlOmissionWord" : undefined}
                          style={{ display: "inline-block", position: "relative", ...annotationTextStyle }}
                        >
                          {token}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>

              <div style={styles.reversionPickerHint}>
                Press the other word in the passage to complete the reversion pair. The two words will be saved with CRLA-style order markers and the reversion direction.
              </div>
            </div>
          </div>
        )}

        {miscueDrawerOpen && selectedPassageWord && (
          <div style={styles.miscueOverlay} role="dialog" aria-modal="true" aria-labelledby="passage-miscue-title">
            <div style={styles.miscueDrawer}>
              <div style={styles.miscueDrawerHeader}>
                <div>
                  <div style={styles.miscueDrawerEyebrow}>MISCUE OBSERVATION</div>
                  <div id="passage-miscue-title" style={styles.miscueDrawerWord}>{passageText.split(/\s+/).filter(Boolean)[Number(selectedPassageWord)-1] || "Selected word"}</div>
                  <div style={styles.miscueDrawerHint}>Choose the miscue type observed for this word.</div>
                </div>
                <button type="button" style={styles.miscueDrawerClose} aria-label="Close miscue options" onClick={() => {setMiscueDrawerOpen(false);setSelectedPassageWord(null);setSelectedMiscueType(null);setSubstitutionInputRequested(false);setReversionSelecting(false);setReversionSourceWord(null);setMisreadWord("");}}>×</button>
              </div>
              <div style={styles.miscueTypeGrid}>
                {[['Insertion','Added word or sound','#1a2b4c','#edf1f7'],['Omission','Word was skipped','#9b2e22','#ebc9c4'],['Substitution','Another word was said','#835b24','#f5ede0'],['Repetition','Word was read more than once','#4a6fa5','#edf1f7'],['Reversion','Word or group of words not read in order','#a9762f','#f5ede0'],['SelfCorrection','Word read incorrectly at first but immediately corrected','#2f5f49','#e8f0ea']].map(([label,description,color,background]) => (
                  <button
                    key={label}
                    type="button"
                    disabled={recordingMiscue || (label==='Reversion' && passageMiscues.some(item=>Number(item.wordIndex)===Number(selectedPassageWord)-1))}
                    title={label==='Reversion' && passageMiscues.some(item=>Number(item.wordIndex)===Number(selectedPassageWord)-1) ? 'Remove the existing miscue before marking a reversion.' : undefined}
                    style={{...styles.miscueTypeButton,color,background,borderColor:color,...(selectedMiscueType===label?styles.miscueTypeButtonSelected:{})}}
                    onClick={() => {
                    setSelectedMiscueType(label);
                    if(label==='Reversion'){
                      setSubstitutionInputRequested(false);
                      setMiscueDrawerOpen(false);
                      setReversionSourceWord(Number(selectedPassageWord));
                      setReversionSelecting(true);
                      setError("");
                      return;
                    }
                    if(label==='Insertion') {
                      const selectedWord = selectedPassageWord;
                      setSubstitutionInputRequested(false);
                      setMiscueDrawerOpen(false);
                      setSelectedPassageWord(null);
                      setSelectedMiscueType(null);
                      setMisreadWord("");
                      void recordPassageMiscue(selectedWord,'Insertion','');
                      return;
                    }
                    if(label==='Substitution') {
                      setSubstitutionInputRequested(true);
                      return;
                    }
                    setSubstitutionInputRequested(false);
                    void recordPassageMiscue(selectedPassageWord,label,'');
                  }}>
                    <span style={styles.miscueTypeText}><span style={styles.miscueTypeName}>{label==='SelfCorrection'?'Self-Correction':label}</span><span style={styles.miscueTypeDescription}>{description}</span></span>
                    <span style={{...styles.miscueTypeArrow,color}}>→</span>
                  </button>
                ))}
              </div>
              {substitutionInputRequested && selectedMiscueType==='Substitution' && (
                <div style={styles.miscueEntryArea}>
                  <label style={styles.miscueEntryLabel}>What did the learner say?</label>
                  <input type="text" value={misreadWord} onChange={e=>setMisreadWord(e.target.value)} placeholder="Enter the substituted word" style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />
                  <button type="button" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,selectedMiscueType,misreadWord)} disabled={recordingMiscue||!misreadWord.trim()}>Apply Miscue</button>
                </div>
              )}
              {passageMiscues.some(item=>Number(item.wordIndex)===Number(selectedPassageWord)-1) && <button type="button" style={styles.removeMiscueButton} onClick={() => void removePassageMiscue()} disabled={recordingMiscue}>Remove Miscue</button>}
            </div>
          </div>
        )}

        {confirmFinishReading && (
          <div
            style={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-reading-title"
          >
            <div style={styles.finishReadingModal}>
              <div style={styles.finishReadingIcon}>
                ✓
              </div>

              <h2
                id="finish-reading-title"
                style={styles.finishReadingTitle}
              >
                Finish Reading?
              </h2>

              <p style={styles.finishReadingText}>
                Are you sure you want to finish timed reading and review
                the passage miscues before continuing to comprehension?
              </p>

              <div style={styles.confirmActions}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={() =>
                    setConfirmFinishReading(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  style={styles.confirmButton}
                  onClick={async () => {
                    setConfirmFinishReading(
                      false
                    );
                    passageClockRef.current.frozenSeconds = passageSeconds;
                    if (passageTimerRef.current) {
                      window.clearInterval(passageTimerRef.current);
                      passageTimerRef.current = null;
                    }
                    setTimeUpSelecting(false);
                    setTimeUpReviewConfirmed(false);
                    setMiscueReviewMode(true);
                    setMiscueDrawerOpen(false);
                    setReversionSelecting(false);
                    setReversionSourceWord(null);
                    setSelectedPassageWord(null);
                    setSelectedMiscueType(null);
                    setMisreadWord("");
                    setError("");
                  }}
                  disabled={
                    passageFinalizingRef.current
                  }
                >
                  Confirm Finish
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmEndSession && (
          <div
            style={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-session-title"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setConfirmEndSession(false);
              }
            }}
          >
            <div style={styles.confirmModal}>
              <div style={styles.confirmIcon}>
                !
              </div>

              <h2
                id="end-session-title"
                style={styles.confirmTitle}
              >
                End Assessment Session?
              </h2>

              <p style={styles.confirmText}>
                This will end the teacher session and cancel
                the current assessment attempt. No assessment
                result will be saved to Assessment Records.
              </p>

              <div style={styles.confirmActions}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={() =>
                    setConfirmEndSession(false)
                  }
                  disabled={busy}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  style={styles.confirmButton}
                  onClick={
                    confirmEndSessionAction
                  }
                  disabled={busy}
                >
                  {busy
                    ? "Ending..."
                    : "End Session"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTerminationObservation && (
          <div style={styles.observationModalOverlay} role="dialog" aria-modal="true" aria-labelledby="final-assessment-review-title">
            <div style={{
              ...styles.observationModal,
              width:
                session?.stage === "terminated" && session?.current_content === "ZERO_SCORE_PART1_TASK1"
                  ? "min(620px,96vw)"
                  : "min(1100px,96vw)",
              maxWidth:
                session?.stage === "terminated" && session?.current_content === "ZERO_SCORE_PART1_TASK1"
                  ? "620px"
                  : "1100px",
              maxHeight: "92vh",
              overflowY: "auto",
            }}>
              <h2 id="final-assessment-review-title" style={styles.observationTitle}>
                {session?.stage === "terminated" ? "Assessment Complete" : "Final Assessment Review"}
              </h2>

              {(() => {
                const isZeroScoreReview = session?.stage === "terminated" && session?.current_content === "ZERO_SCORE_PART1_TASK1";
                if (isZeroScoreReview) {
                  return (
                    <div style={{ marginTop: "16px", textAlign: "center" }}>
                      <div style={{ color: "#2a3a55", fontSize: "20px", fontWeight: "950" }}>0 / 10 Letter Sounds</div>
                      <p style={{ margin: "7px 0 0", color: "#6b7789", fontSize: "13px" }}>Low Emerging Reader · Full Refresher</p>
                      <label style={{ ...styles.observationField, maxWidth: "520px", margin: "20px auto 0", textAlign: "center" }}>
                        <span>Optional teacher remarks</span>
                        <textarea value={terminationRemarks} onChange={(event) => setTerminationRemarks(event.target.value)} disabled={savingTerminationObservation} maxLength={5000} placeholder="Enter optional remarks about this assessment..." style={styles.observationTextarea} />
                      </label>
                    </div>
                  );
                }
                const isPart1StopReview = session?.stage === "terminated";
                const metrics = session?.metrics || {};
                const task1 = Array.isArray(session?.task1Results) ? session.task1Results : [];
                const task2 = Array.isArray(session?.task2Results) ? session.task2Results : [];
                const comp = mergeComprehensionResults(
                  Array.isArray(session?.comprehensionResults)
                    ? session.comprehensionResults
                    : [],
                  passageDraftRef.current.comprehension || [],
                  comprehensionDraftRef.current?.code === code
                    ? comprehensionDraftRef.current.comprehension
                    : []
                );
                /*
                 * Part 1 must always be reported from the teacher's own
                 * journal. That journal is exactly what Save submits and what
                 * the API rewrites into the Letter/Word rows. Server metrics
                 * are refreshed by best-effort background writes, so a lagging
                 * row set must never lower the score shown here; that is how a
                 * recorded 10/20 could flip to 6/20 in this overlay.
                 */
                const part1Journal =
                  part1ResultsDraftRef.current?.code === code
                    ? part1ResultsDraftRef.current
                    : null;
                const journalTask1Results = Array.isArray(part1Journal?.task1Results)
                  ? part1Journal.task1Results
                  : [];
                const journalTask2Results = Array.isArray(part1Journal?.task2Results)
                  ? part1Journal.task2Results
                  : [];
                const hasCompletePart1Journal =
                  journalTask1Results.length >= LETTERS.length &&
                  journalTask2Results.length >= WORDS.length;
                const task1Record = hasCompletePart1Journal
                  ? mergeReviewTaskResults(task1, journalTask1Results)
                  : task1;
                const task2Record = hasCompletePart1Journal
                  ? mergeReviewTaskResults(task2, journalTask2Results)
                  : task2;
                const reviewPassageWords = String(
                  String(session?.story_title || session?.storyTitle || "")
                    .toLowerCase()
                    .includes("a day in the fields")
                    ? FIELD_PASSAGE_TEXT
                    : PASSAGE_TEXT
                ).trim().split(/\s+/).filter(Boolean);
                const miscues = (
                  Array.isArray(metrics.passageMiscues)
                    ? metrics.passageMiscues
                    : passageDraftRef.current.miscues || []
                ).map((item) => ({
                  ...item,
                  word:
                    item.word ||
                    reviewPassageWords[Number(item.wordIndex)] ||
                    "Selected word",
                }));
                const wordsRead = Number(metrics.wordsRead ?? Math.max(0, 100 - Number(metrics.totalMiscues || 0)));
                const totalTime = Number(metrics.timerSeconds || 0);
                const wpm = metrics.wpm == null ? (totalTime ? Number(((wordsRead / totalTime) * 60).toFixed(2)) : null) : Number(metrics.wpm);
                const experience = Number(metrics.experienceRating || 0);
                const task1Score = hasCompletePart1Journal
                  ? journalTask1Results.filter((item) => item.isCorrect === true).length
                  : Number(metrics.task1Score ?? task1.filter((item) => item.isCorrect).length);
                const task2Score = hasCompletePart1Journal
                  ? journalTask2Results.filter((item) => item.isCorrect === true).length
                  : Number(metrics.task2Score ?? task2.filter((item) => item.isCorrect).length);
                const totalPart1Score = task1Score + task2Score;
                const part1ReadingLevel = hasCompletePart1Journal
                  ? totalPart1Score === 0
                    ? "Full Refresher"
                    : totalPart1Score <= 10
                      ? "Moderate Refresher"
                      : totalPart1Score <= 16
                        ? "Light Refresher"
                        : "Grade Ready"
                  : metrics.part1ReadingLevel || metrics.part1Profile || "—";
                const readingPercentage = Number(metrics.readingAccuracy ?? metrics.miscueAccuracy ?? Math.max(0, 100 - Number(metrics.totalMiscues || 0)));
                /*
                 * Comprehension must never be lowered by a lagging server read -
                 * that is exactly how marked-correct answers were reported as
                 * 0/6. `comp` already prefers the teacher's journal per index,
                 * which is also what Save submits. Server metrics are only used
                 * for indices the teacher did not record on this device.
                 */
                const hasLocalComprehensionJournal =
                  comprehensionDraftRef.current?.code === code &&
                  comprehensionDraftRef.current.comprehension.length > 0;
                const comprehensionCorrect = hasLocalComprehensionJournal
                  ? countCorrectComprehension(comp)
                  : Number(
                      metrics.comprehensionScore ??
                        countCorrectComprehension(comp)
                    );
                const readingProfile = getScoresheetReadingProfile(totalPart1Score, readingPercentage, comprehensionCorrect);
                const storyNumber = getScoresheetStoryNumber(session?.story_title || session?.storyTitle) ?? Number(metrics.storyNumber || 0);
                const minutes = Math.floor(totalTime / 60);
                const seconds = totalTime % 60;
                const task1Items = LETTERS.map((letter, index) => task1Record.find((item) => Number(item.index) === index) || { index, content: letter, isCorrect: null });
                const task2Items = WORDS.map((word, index) => task2Record.find((item) => Number(item.index) === index) || { index, content: word, isCorrect: null });
                const readingProfileTone = getReadingProfileTone(readingProfile);

                return (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px", marginTop: "14px" }}>
                      {[
                        ["Part 1 Task 1 — Letter Sounds", `${task1Score} / 10`, task1Items],
                        ["Part 1 Task 2 — Word Recognition", `${task2Score} / 10`, task2Items],
                      ].map(([title, score, items]) => (
                        <section key={title} style={{ padding: "14px", border: "1px solid #dce3ec", borderRadius: "14px", background: "#fafafa" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                            <h3 style={{ margin: 0, color: "#2a3a55", fontSize: "15px", fontWeight: "950" }}>{title}</h3>
                            <strong style={{ color: "#1a2b4c", fontSize: "16px" }}>{score}</strong>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "7px", marginTop: "10px" }}>
                            {items.map((item) => (
                              <div key={`${title}-${item.index}`} style={{ padding: "8px 10px", borderRadius: "9px", background: item.isCorrect === true ? "#e8f0ea" : item.isCorrect === false ? "#f8eae8" : "#fafafa", color: item.isCorrect === true ? "#2f5f49" : item.isCorrect === false ? "#9b2e22" : "#46536b", fontSize: "12px", fontWeight: "900" }}>
                                {Number(item.index) + 1}. {item.content} — {item.isCorrect === true ? "Correct" : item.isCorrect === false ? "Incorrect" : "Not recorded"}
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>

                    <section style={{ marginTop: "12px", padding: "14px", border: "1px solid #dce4ef", borderRadius: "14px", background: "#edf1f7", textAlign: "center" }}>
                      <div style={{ color: "#4a6fa5", fontSize: "11px", fontWeight: "900", textTransform: "uppercase", letterSpacing: ".06em" }}>Part 1 Total</div>
                      <div style={{ marginTop: "4px", color: "#1a2b4c", fontSize: "26px", fontWeight: "950" }}>{totalPart1Score} / 20</div>
                    </section>
                    <section style={{ marginTop: "10px", padding: "12px 14px", border: "1px solid #dce3ec", borderRadius: "14px", background: "#ffffff", textAlign: "center" }}>
                      <div style={{ color: "#6b7789", fontSize: "10px", fontWeight: "900", textTransform: "uppercase", letterSpacing: ".04em" }}>Part 1 Reading Level</div>
                      <div style={{ marginTop: "4px", color: "#2a3a55", fontSize: "18px", fontWeight: "950" }}>{part1ReadingLevel}</div>
                    </section>

                    {!isPart1StopReview && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "10px", marginTop: "12px" }}>
                      {[
                        ["Story Number", storyNumber ? `${storyNumber} — ${session?.story_title || session?.storyTitle || ""}` : "—"],
                        ["Words Read", wordsRead],
                        ["Total Time Reading", `${minutes}m ${String(seconds).padStart(2, "0")}s`],
                        ["WPM", wpm == null ? "—" : wpm.toFixed(2)],
                        ["Reading %", `${readingPercentage.toFixed(2)}%`],
                        ["Total Correct Answer", `${comprehensionCorrect} / 6`],
                        ["Learner Experience", experience ? `${experience}/5` : "Pending"],
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: "12px", border: "1px solid #dce3ec", borderRadius: "12px", background: "#ffffff" }}>
                          <div style={{ color: "#6b7789", fontSize: "10px", fontWeight: "900", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                          <div style={{ marginTop: "4px", color: "#2a3a55", fontSize: "17px", fontWeight: "950" }}>{value}</div>
                        </div>
                      ))}
                    </div>}

                    {!isPart1StopReview && <section style={{ marginTop: "12px", padding: "14px", border: "1px solid #dce3ec", borderRadius: "14px", background: "#fafafa" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <h3 style={{ margin: 0, color: "#2a3a55", fontSize: "15px", fontWeight: "950" }}>Total Miscues — {miscues.length}</h3>
                        <button type="button" style={styles.miscueInlineConfirmButton} onClick={() => setShowExactMiscues((shown) => !shown)} disabled={!miscues.length}>
                          {showExactMiscues ? "Hide exact miscued words" : "View exact miscued words"}
                        </button>
                      </div>
                      {showExactMiscues && <div style={{ display: "grid", gap: "6px", marginTop: "9px" }}>
                        {miscues.map((item, index) => (
                          <div key={`${item.wordIndex}-${item.miscueType}-${index}`} style={{ padding: "8px 10px", borderRadius: "9px", background: "#ffffff", border: "1px solid #dce3ec", color: "#2a3a55", fontSize: "12px" }}>
                            Position {Number(item.wordIndex) + 1}: <strong>{item.word || "Selected word"}</strong> — {item.miscueType}{item.miscueType === "Substitution" && item.misreadWord ? ` (said: ${item.misreadWord})` : ""}
                          </div>
                        ))}
                      </div>}
                    </section>}

                    {!isPart1StopReview && <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginTop: "16px" }}>
                      <label style={styles.observationField}>
                        <span>Observation Level</span>
                        <select value={finalObservationLevel} onChange={(event) => setFinalObservationLevel(event.target.value)} style={styles.observationSelect} disabled={savingTerminationObservation}>
                          <option value="">Select Observation Level</option>
                          <option value="1">Level 1: Reads word by word</option>
                          <option value="2">Level 2: Reads word in chunks</option>
                          <option value="3">Level 3: Reads fluently but ignores punctuation</option>
                          <option value="4">Level 4: Reads fluently with proper expression</option>
                        </select>
                      </label>
                    </div>}

                    <section style={{ marginTop: "16px", padding: "20px", border: `2px solid ${readingProfileTone.border}`, borderRadius: "16px", background: readingProfileTone.background, textAlign: "center" }}>
                      <div style={{ color: readingProfileTone.color, fontSize: "11px", fontWeight: "950", textTransform: "uppercase", letterSpacing: ".08em" }}>Reading Profile</div>
                      <div style={{ marginTop: "6px", color: readingProfileTone.color, fontSize: "28px", lineHeight: 1.2, fontWeight: "950" }}>{readingProfile}</div>
                    </section>

                    {!(session?.stage === "terminated" && session?.current_content === "ZERO_SCORE_PART1_TASK1") && <label style={styles.observationField}>
                      <span>Remarks <span style={styles.optionalLabel}>(optional)</span></span>
                      <textarea value={terminationRemarks} onChange={(event) => setTerminationRemarks(event.target.value)} disabled={savingTerminationObservation} maxLength={5000} placeholder="Enter your observation or remarks for this learner..." style={styles.observationTextarea} />
                    </label>}
                  </>
                );
              })()}

              {terminationObservationError && <div style={styles.observationError} role="alert">{terminationObservationError}</div>}

              <div style={{
                margin: "16px auto 0",
                maxWidth:
                  session?.stage === "terminated" && session?.current_content === "ZERO_SCORE_PART1_TASK1"
                    ? "520px"
                    : "100%",
              }}>
                <button
                  type="button"
                  style={{ ...styles.observationSaveButton, width: "100%" }}
                  onClick={saveTerminationObservation}
                  /*
                   * Always pressable while not already saving. A missing
                   * Observation Level is reported by the handler with a visible
                   * reminder, instead of leaving the teacher with a dead button
                   * and no explanation.
                   */
                  disabled={savingTerminationObservation}
                >
                  {savingTerminationObservation ? "Saving Assessment..." : "Save and Back to Dashboard"}
                </button>
              </div>
            </div>
          </div>
        )}

        {busy && (
          <div style={styles.busy}>
            <div style={styles.busySpinner} />
            <span>Saving...</span>
          </div>
        )}
      </div>
    </main>
    </>
  );
}

const styles = {
  page: {
    minHeight:
      "100vh",
    background:
      "#fafafa",
    color:
      "#1f2a3c",
    fontFamily:
      "Arial, Helvetica, sans-serif",
    padding:
      "20px",
  },

  container: {
    width:
      "100%",
    maxWidth:
      "1180px",
    margin:
      "0 auto",
  },

  header: {
    width:
      "100%",
    margin:
      "0",
    minHeight:
      "78px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "space-between",
    gap:
      "16px",
    background:
      "#1a2b4c",
    border:
      "1px solid #1a2b4c",
    borderRadius:
      "14px",
    padding:
      "12px 20px",
    boxShadow: "none",
  },

  brand: {
    color:
      "#1a2b4c",
    fontSize:
      "21px",
    fontWeight:
      "900",
  },

  headerSub: {
    color:
      "#ffffff",
    fontSize:
      "22px",
    lineHeight:
      1.25,
    fontWeight:
      "950",
    letterSpacing:
      "-.02em",
    minWidth:
      0,
    flex:
      "1 1 auto",
    overflowWrap:
      "anywhere",
    wordBreak:
      "break-word",
  },

  codeCard: {
    width:
      "100%",
    minHeight:
      "250px",
    margin:
      "0",
    padding:
      "28px",
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "center",
    justifyContent:
      "center",
    background:
      "#ecdfb8",
    color:
      "#9b2e22",
    border:
      "1px solid #e3d3a0",
    borderRadius:
      "16px",
    textAlign:
      "center",
    boxShadow: "none",
    boxSizing:
      "border-box",
  },

  codeLabel: {
    fontSize:
      "12px",
    textTransform:
      "uppercase",
    fontWeight:
      "800",
    letterSpacing:
      "1px",
    opacity:
      0.8,
  },

  code: {
    marginTop:
      "10px",
    fontSize:
      "48px",
    fontWeight:
      "900",
    letterSpacing:
      "8px",
  },

  connectionStatus: {
    marginTop:
      "6px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "7px",
    fontSize:
      "10px",
  },

  dot: {
    width:
      "8px",
    height:
      "8px",
    borderRadius:
      "50%",
    display:
      "inline-block",
  },

  connectedStatusCard: {
    width:
      "100%",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "10px",
    borderRadius:
      "18px",
    background:
      "#fafafa",
    border:
      "1px solid #e8f0ea",
    color:
      "#2f5f49",
    fontSize:
      "19px",
    fontWeight:
      "950",
    boxShadow: "none",
    boxSizing:
      "border-box",
  },

  assessmentCard: {
    width:
      "100%",
    minHeight:
      "440px",
    margin:
      "0",

    background:
      "#ffffff",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "12px",
    overflow:
      "hidden",
    boxShadow: "none",
  },

  stageHeader: {
    padding:
      "18px 20px",
    borderBottom:
      "1px solid #edf1f7",
  },

  smallLabel: {
    color:
      "#6b7789",
    fontSize:
      "10px",
    textTransform:
      "uppercase",
    letterSpacing:
      "0.8px",
    fontWeight:
      "900",
  },

  title: {
    margin:
      "5px 0 0",
    color:
      "#2a3a55",
    fontSize:
      "22px",
    fontWeight:
      "900",
  },

  waitingPanel: {
    minHeight:
      "430px",
    padding:
      "88px 44px",
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "center",
    justifyContent:
      "center",
    textAlign:
      "center",
  },

  waitingCircle: {
    width:
      "58px",
    height:
      "58px",
    margin:
      "0 auto 14px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "50%",
    background:
      "#edf1f7",
    color:
      "#1a2b4c",
    fontSize:
      "25px",
    fontWeight:
      "900",
  },

  sectionTitle: {
    margin:
      0,
    color:
      "#2a3a55",
    fontSize:
      "32px",
    lineHeight:
      1.2,
    fontWeight:
      "950",
  },

  muted: {
    margin:
      "14px auto 20px",
    maxWidth:
      "740px",
    color:
      "#6b7789",
    fontSize:
      "16px",
    lineHeight:
      1.7,
  },

  stagePanel: {
    padding:
      "30px",
    textAlign:
      "center",
  },

  counter: {
    color:
      "#6b7789",
    fontSize:
      "14px",
    fontWeight:
      "800",
  },

  contentDisplay: {
    minHeight:
      "260px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    color:
      "#1a2b4c",
    fontSize:
      "108px",
    fontWeight:
      "950",
  },

  answerButtons: {
    display:
      "flex",
    justifyContent:
      "center",
    gap:
      "10px",
    flexWrap:
      "wrap",
  },

  successButton: {
    minWidth:
      "170px",
    minHeight:
      "50px",
    border:
      0,
    borderRadius:
      "14px",
    background:
      "#3e7a5e",
    color:
      "#ffffff",
    fontSize:
      "16px",
    fontWeight:
      "950",
    cursor:
      "pointer",
    transition:
      "transform .14s ease, box-shadow .14s ease, filter .14s ease",
    boxShadow: "none",
  },

  dangerButton: {
    minWidth:
      "170px",
    minHeight:
      "50px",
    border:
      0,
    borderRadius:
      "14px",
    background:
      "#d9534f",
    color:
      "#ffffff",
    fontSize:
      "16px",
    fontWeight:
      "950",
    cursor:
      "pointer",
    transition:
      "transform .14s ease, box-shadow .14s ease, filter .14s ease",
    boxShadow: "none",
  },

  storyChoicePanel: {
    padding: "26px 22px",
    textAlign: "left",
    background: "#fafafa",
    borderRadius: "0 0 14px 14px",
  },

  storyChoiceBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#edf1f7",
    color: "#4a6fa5",
    fontSize: "10px",
    fontWeight: "900",
    letterSpacing: "1px",
    boxShadow: "none",
  },

  storyChoiceTitle: {
    margin: "10px 0 0",
    color: "#2a3a55",
    fontSize: "24px",
    fontWeight: "900",
  },

  storyChoiceText: {
    margin: "7px 0 18px",
    color: "#6b7789",
    fontSize: "11px",
    lineHeight: 1.6,
    maxWidth: "650px",
  },

  /* One passage per row, each large enough to read and tap comfortably. */
  storyChoiceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "16px",
  },

  storyChoiceCard: {
    display: "grid",
    gridTemplateColumns: "76px 1fr auto",
    alignItems: "center",
    gap: "20px",
    padding: "24px",
    border: "1px solid #dce3ec",
    borderRadius: "16px",
    background: "#ffffff",
    boxShadow: "none",
  },

  storyChoiceIcon: {
    width: "76px",
    height: "76px",
    borderRadius: "18px",
    display: "grid",
    placeItems: "center",
    background: "#edf1f7",
    fontSize: "36px",
    boxShadow: "none",
  },

  storyChoiceBody: {
    minWidth: 0,
  },

  storyChoiceTitleSmall: {
    color: "#2a3a55",
    fontSize: "21px",
    fontWeight: "900",
    lineHeight: 1.25,
  },

  storyChoiceDescription: {
    marginTop: "7px",
    color: "#6b7789",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  storyChoiceButton: {
    minHeight: "52px",
    padding: "0 22px",
    border: 0,
    borderRadius: "10px",
    background: "#1a2b4c",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "900",
    cursor: "pointer",
    boxShadow: "none",
  },

  storyChoiceButtonDisabled: {
    minHeight: "52px",
    padding: "0 22px",
    border: "1px solid #dce3ec",
    borderRadius: "10px",
    background: "#edf1f7",
    color: "#98a2b3",
    fontSize: "14px",
    fontWeight: "800",
    cursor: "not-allowed",
  },

  passageWord: {
    border: 0,
    background: "transparent",
    padding: "2px 3px",
    margin: 0,
    color: "#2a3a55",
    font: "inherit",
    cursor: "pointer",
    borderRadius: "6px",
  },
  passageWordSelected: {
    background: "#edf1f7",
    boxShadow: "none",
  },
  timerIconShell: {
    width: "54px",
    height: "54px",
    margin: "0 auto 10px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "#edf1f7",
    color: "#1a2b4c",
    boxShadow: "none",
  },

  timerIcon: {
    fontSize: "31px",
    lineHeight: 1,
    fontWeight: "900",
  },

  timerIconButton: {
    width: "50px",
    height: "50px",
    margin: "11px auto 0",
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: "50%",
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "950",
    cursor: "pointer",
    boxShadow: "none",
  },

  timerPauseIcon: {
    background: "#d9534f",
  },

  timerResumeIcon: {
    background: "#3e7a5e",
  },

  timeoutWorkflowCard: {
    width: "min(680px,680px)",
    margin: "12px auto 0",
    padding: "20px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  timeoutStepBadge: {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#edf1f7",
    color: "#4a6fa5",
    fontSize: "11px",
    fontWeight: "950",
    letterSpacing: ".08em",
  },

  timeoutWorkflowTitle: {
    marginTop: "8px",
    color: "#2a3a55",
    fontSize: "20px",
    fontWeight: "950",
  },

  timeoutWorkflowText: {
    margin: "7px 0 13px",
    color: "#6b7789",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  timeoutWorkflowHint: {
    marginTop: "7px",
    color: "#6b7789",
    fontSize: "12px",
    lineHeight: 1.4,
  },

  timeoutConfirmButton: {
    minHeight: "48px",
    padding: "0 19px",
    border: 0,
    borderRadius: "12px",
    background: "#4a6fa5",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
  },

  timerToggleButton: {
    marginTop: "10px",
    minHeight: "34px",
    padding: "0 14px",
    border: "1px solid #dce3ec",
    borderRadius: "10px",
    background: "#edf1f7",
    color: "#1a2b4c",
    fontSize: "10px",
    fontWeight: "900",
    cursor: "pointer",
  },
  timeUpOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 4000,
    display: "grid",
    placeItems: "center",
    padding: "18px",
    background: "rgba(14,42,67,.42)",
    backdropFilter: "blur(8px)",
  },
  timeUpCard: {
    width: "min(520px,94vw)",
    padding: "28px",
    borderRadius: "22px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
    boxShadow: "none",
    textAlign: "center",
  },
  timeUpIcon: {
    fontSize: "34px",
  },
  timeUpTitle: {
    marginTop: "9px",
    color: "#2a3a55",
    fontSize: "23px",
    fontWeight: "900",
  },
  timeUpText: {
    marginTop: "8px",
    color: "#6b7789",
    fontSize: "12px",
    lineHeight: 1.55,
  },
  timeUpSelectionValue: {
    marginTop: "15px",
    padding: "11px",
    borderRadius: "12px",
    background: "#edf1f7",
    color: "#1a2b4c",
    fontSize: "12px",
    fontWeight: "900",
  },

  passage: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "0",
    border: "0",
    background: "transparent",
    color: "#2a3a55",
    textAlign: "left",
    lineHeight: 1.9,
    fontSize: "18px",
  },

  passageInterface: {
    width: "100%",
    maxWidth: "940px",
    margin: "0 auto",
    padding: "8px 0 24px",
    textAlign: "left",
  },

  passageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    padding: "18px 20px",
    marginBottom: "16px",
    borderRadius: "20px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  passageEyebrow: {
    color: "#6b7789",
    fontSize: "13px",
    fontWeight: "900",
    letterSpacing: ".12em",
    textTransform: "uppercase",
  },

  passageStoryTitle: {
    margin: "5px 0 0",
    color: "#2a3a55",
    fontSize: "27px",
    lineHeight: 1.2,
    fontWeight: "950",
  },

  passageInstruction: {
    margin: "8px 0 0",
    maxWidth: "690px",
    color: "#6b7789",
    fontSize: "14px",
    lineHeight: 1.55,
  },

  passageStatus: {
    flex: "0 0 auto",
    minHeight: "38px",
    padding: "0 13px",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "999px",
    background: "#e8f0ea",
    color: "#2f5f49",
    fontSize: "12px",
    fontWeight: "950",
    boxShadow: "none",
  },

  passageStatusPaused: {
    background: "#f5ede0",
    color: "#835b24",
  },

  passageStatusDot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    background: "currentColor",
    boxShadow: "none",
  },

  passageReadingCard: {
    padding: "24px",
    borderRadius: "22px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  passageMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    paddingBottom: "12px",
    marginBottom: "10px",
    color: "#6b7789",
    fontSize: "13px",
    fontWeight: "800",
    borderBottom: "1px solid #dce3ec",
  },

  passageText: {
    padding: "12px 10px 18px",
    color: "#2a3a55",
    fontSize: "20px",
    lineHeight: 2,
    letterSpacing: ".01em",
    textAlign: "left",
  },

  passageWord: {
    border: "0",
    borderRadius: "7px",
    margin: "0 2px",
    padding: "1px 3px",
    background: "transparent",
    color: "#2a3a55",
    font: "inherit",
    lineHeight: "inherit",
    cursor: "pointer",
    transition:
      "background .12s ease, color .12s ease, box-shadow .12s ease, transform .12s ease",
  },

  passageWordSelected: {
    background: "#edf1f7",
    color: "#1a2b4c",
    boxShadow: "none",
    transform: "translateY(-1px)",
  },

  passageControlGrid: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "22px",
    marginTop: "20px",
  },

  passageTimerCard: {
    width: "min(430px,94vw)",
    minHeight: "78px",
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    borderRadius: "20px",
    background: "#edf1f7",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  timerInfo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "105px",
  },

  lastWordCard: {
    minHeight: "170px",
    padding: "20px",
    borderRadius: "20px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  lastWordTitle: {
    color: "#46536b",
    fontSize: "14px",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: ".06em",
  },

  lastWordValue: {
    marginTop: "10px",
    color: "#1a2b4c",
    fontSize: "29px",
    fontWeight: "950",
    fontVariantNumeric: "tabular-nums",
  },

  lastWordValueSpan: {
    color: "#6b7789",
    fontSize: "18px",
    fontWeight: "800",
  },

  lastWordWaiting: {
    marginTop: "16px",
    color: "#6b7789",
    fontSize: "18px",
    fontWeight: "800",
  },

  lastWordHint: {
    margin: "9px 0 0",
    color: "#6b7789",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  passageFinishRow: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "2px",
  },

  primaryPassageButton: {
    minHeight: "50px",
    padding: "0 22px",
    border: 0,
    borderRadius: "14px",
    background: "#4a6fa5",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "9px",
    boxShadow: "none",
  },

  startReadingSpinner: {
    width: "17px",
    height: "17px",
    border: "2px solid rgba(255,255,255,.4)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "crlAssessmentSpin .65s linear infinite",
  },

  miscueInlinePrompt: { width: "min(760px,100%)", margin: "0 auto", padding: "18px", borderRadius: "18px", background: "#fafafa", border: "1px solid #dce3ec", boxShadow: "none", textAlign: "left" },
  miscueInlinePromptBadge: { display: "inline-block", padding: "4px 8px", borderRadius: "999px", background: "#edf1f7", color: "#4a6fa5", fontSize: "11px", fontWeight: "950", letterSpacing: ".08em" },
  miscueInlinePromptTitle: { marginTop: "7px", color: "#2a3a55", fontSize: "22px", fontWeight: "950" },
  miscueInlinePromptText: { marginTop: "6px", color: "#6b7789", fontSize: "14px", lineHeight: 1.5 },
  miscueInlineSelectedWord: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "12px", padding: "10px 12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #dce3ec" },
  miscueInlineSelectedLabel: { color: "#6b7789", fontSize: "10px", fontWeight: "900", textTransform: "uppercase", letterSpacing: ".08em" },
  miscueInlineTypeGrid: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "8px", marginTop: "12px" },
  miscueInlineTypeButton: { minHeight: "64px", padding: "8px", borderRadius: "11px", border: "1px solid", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", textAlign: "left" },
  miscueInlineTypeButtonSelected: { boxShadow: "none", transform: "translateY(-1px)" },
  miscueInlineTypeName: { display: "block", fontSize: "11px", lineHeight: 1.15 },
  miscueInlineTypeHint: { display: "block", marginTop: "4px", color: "#6b7789", fontSize: "9px", lineHeight: 1.25 },
  miscueInlineTypeArrow: { fontSize: "15px", fontWeight: "950" },
  miscueInlineEntry: { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "end", marginTop: "11px" },
  miscueInlineEntryLabel: { gridColumn: "1 / -1", color: "#46536b", fontSize: "10px", fontWeight: "900" },
  miscueInlineInput: { minHeight: "42px", padding: "0 11px", borderRadius: "10px", border: "1px solid #c7d2e0", background: "#ffffff", color: "#2a3a55", outline: "none" },
  miscueInlineApplyButton: { minHeight: "42px", padding: "0 13px", border: 0, borderRadius: "10px", background: "#4a6fa5", color: "#ffffff", fontSize: "11px", fontWeight: "950", cursor: "pointer" },
  miscueInlineConfirmButton: { width: "100%", minHeight: "48px", marginTop: "13px", border: 0, borderRadius: "12px", background: "#3e7a5e", color: "#ffffff", fontSize: "15px", fontWeight: "950", cursor: "pointer" },

  reversionOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 6000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background: "rgba(26,43,76,.72)",
    backdropFilter: "blur(9px)",
    WebkitBackdropFilter: "blur(9px)",
  },

  reversionPickerCard: {
    width: "min(1040px,96vw)",
    maxHeight: "92vh",
    overflowY: "auto",
    padding: "28px",
    borderRadius: "24px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  reversionPickerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
  },

  reversionPickerTitle: {
    marginTop: "6px",
    color: "#2a3a55",
    fontSize: "28px",
    lineHeight: 1.2,
    fontWeight: "950",
  },

  reversionSourceBadge: {
    marginTop: "18px",
    padding: "12px 14px",
    borderRadius: "13px",
    background: "#edf1f7",
    border: "1px solid #dce3ec",
    color: "#1a2b4c",
    fontSize: "14px",
    fontWeight: "800",
  },

  reversionPassageMask: {
    marginTop: "16px",
    padding: "22px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #dce3ec",
    boxShadow: "none",
    color: "#2a3a55",
    fontSize: "20px",
    lineHeight: 2,
  },

  reversionWordButton: {
    position: "relative",
    border: "1px solid transparent",
    borderRadius: "7px",
    margin: "0 2px",
    padding: "2px 5px",
    background: "transparent",
    color: "#2a3a55",
    font: "inherit",
    lineHeight: "inherit",
    cursor: "pointer",
    transition: "background .12s ease, color .12s ease, box-shadow .12s ease, transform .12s ease",
  },

  reversionWordButtonHover: {
    background: "#edf1f7",
    color: "#1a2b4c",
  },

  reversionSourceWord: {
    background: "#f5ede0",
    color: "#a9762f",
    borderColor: "#dcb87a",
    boxShadow: "none",
    cursor: "default",
  },

  reversionExistingMiscueWord: {
    background: "#f5ede0",
    color: "#a9762f",
    borderColor: "#dcb87a",
    boxShadow: "none",
  },

  reversionWordMarker: {
    position: "absolute",
    top: "-15px",
    left: "50%",
    transform: "translateX(-50%)",
    color: "#a9762f",
    fontSize: "12px",
    lineHeight: 1,
    fontWeight: "950",
    pointerEvents: "none",
  },

  reversionPickerHint: {
    marginTop: "12px",
    color: "#6b7789",
    fontSize: "13px",
    lineHeight: 1.55,
  },

  miscueOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 5000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background: "rgba(26,43,76,.44)",
    backdropFilter: "blur(6px)",
  },

  miscueDrawer: {
    width: "min(680px,94vw)",
    maxHeight: "min(720px,90vh)",
    overflowY: "auto",
    padding: "28px",
    borderRadius: "24px",
    background: "#ffffff",
    border: "1px solid #dce3ec",
    boxShadow: "none",
  },

  miscueReviewSection: {
    marginBottom: "18px",
    padding: "16px",
    borderRadius: "16px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
  },
  miscueReviewTitle: {
    color: "#2a3a55",
    fontSize: "18px",
    fontWeight: "950",
  },
  miscueReviewText: {
    marginTop: "6px",
    color: "#6b7789",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  miscueReviewWordGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    maxHeight: "220px",
    overflowY: "auto",
    marginTop: "12px",
    padding: "10px",
    borderRadius: "12px",
    background: "#ffffff",
    border: "1px solid #dce3ec",
  },
  miscueReviewWordButton: {
    border: "1px solid #dce3ec",
    borderRadius: "8px",
    background: "#fafafa",
    color: "#2a3a55",
    padding: "5px 7px",
    fontSize: "13px",
    cursor: "pointer",
  },
  miscueReviewWordMarked: {
    borderColor: "#dcb87a",
    background: "#f5ede0",
  },
  miscueReviewWordSelected: {
    boxShadow: "0 0 0 2px #4a6fa5",
    background: "#edf1f7",
    color: "#1a2b4c",
  },
  miscueReviewConfirmButton: {
    width: "100%",
    minHeight: "50px",
    marginTop: "18px",
    border: 0,
    borderRadius: "13px",
    background: "#3e7a5e",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
  },

  miscueDrawerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    marginBottom: "20px",
  },

  miscueDrawerEyebrow: {
    color: "#6b7789",
    fontSize: "12px",
    fontWeight: "950",
    letterSpacing: ".12em",
  },

  miscueDrawerWord: {
    marginTop: "5px",
    color: "#2a3a55",
    fontSize: "30px",
    lineHeight: 1.2,
    fontWeight: "950",
  },

  miscueDrawerHint: {
    marginTop: "7px",
    color: "#6b7789",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  miscueDrawerClose: {
    width: "42px",
    height: "42px",
    flex: "0 0 auto",
    border: "1px solid #dce3ec",
    borderRadius: "50%",
    background: "#fafafa",
    color: "#46536b",
    fontSize: "25px",
    lineHeight: 1,
    cursor: "pointer",
  },

  miscueTypeGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2,minmax(0,1fr))",
    gap: "12px",
  },

  miscueTypeText: {
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "flex-start",
    gap:
      "4px",
    minWidth:
      0,
  },

  miscueTypeName: {
    display:
      "block",
    marginBottom:
      "2px",
    whiteSpace:
      "nowrap",
    fontSize:
      "15px",
    lineHeight:
      1.2,
    fontWeight:
      "950",
  },

  miscueTypeDescription: {
    display:
      "block",
    color:
      "rgba(61,80,99,.72)",
    fontSize:
      "13px",
    lineHeight:
      1.35,
    fontWeight:
      "650",
  },

  removeMiscueButton: {
    width:
      "100%",
    minHeight:
      "48px",
    marginTop:
      "14px",
    border:
      "1px solid #ebc9c4",
    borderRadius:
      "12px",
    background:
      "#f8eae8",
    color:
      "#c0392b",
    fontSize:
      "14px",
    fontWeight:
      "950",
    cursor:
      "pointer",
  },

  miscueTypeButton: {
    minHeight: "82px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    padding: "14px 16px",
    border: "2px solid",
    borderRadius: "15px",
    textAlign: "left",
    cursor: "pointer",
    transition:
      "transform .12s ease, box-shadow .12s ease",
  },

  miscueTypeButtonSelected: {
    boxShadow: "none",
    transform: "translateY(-1px)",
  },

  miscueTypeArrow: {
    fontSize: "22px",
    fontWeight: "950",
  },

  miscueEntryArea: {
    marginTop: "14px",
    paddingTop: "16px",
    borderTop: "1px solid #dce3ec",
  },

  miscueEntryLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#2a3a55",
    fontSize: "14px",
    fontWeight: "900",
  },

  miscueEntryPrompt: {
    margin: "0 0 10px",
    color: "#6b7789",
    fontSize: "13px",
    lineHeight: 1.45,
    fontWeight: "650",
  },

  miscueDrawerInput: {
    width: "100%",
    minHeight: "50px",
    padding: "0 14px",
    border: "1px solid #c7d2e0",
    borderRadius: "12px",
    background: "#fafafa",
    color: "#2a3a55",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  },

  miscueApplyButton: {
    minHeight: "48px",
    marginTop: "12px",
    padding: "0 18px",
    border: 0,
    borderRadius: "12px",
    background: "#4a6fa5",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
  },

  timeUpOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 4000,
    display: "none",
  },

  question: {
    maxWidth:
      "700px",
    minHeight:
      "130px",
    margin:
      "14px auto",
    padding:
      "28px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "9px",
    background:
      "#fafafa",
    color:
      "#2a3a55",
    fontSize:
      "21px",
    fontWeight:
      "800",
  },

  passageControls: {
    display:
      "grid",
    gridTemplateColumns:
      "160px minmax(160px, 1fr)",
    gap:
      "10px",
    maxWidth:
      "760px",
    margin:
      "0 auto 12px",
  },

  timerCard: {
    padding:
      "12px",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "9px",
    background:
      "#fafafa",
    textAlign:
      "center",
  },

  timerLabel: {
    color:
      "#6b7789",
    fontSize:
      "9px",
    fontWeight:
      "900",
    letterSpacing:
      ".08em",
  },

  timerValue: {
    marginTop:
      "2px",
    color:
      "#1a2b4c",
    fontSize:
      "25px",
    fontWeight:
      "900",
    fontVariantNumeric:
      "tabular-nums",
  },

  timerHint: {
    marginTop:
      "2px",
    color:
      "#6b7789",
    fontSize:
      "9px",
  },

  field: {
    display:
      "flex",
    flexDirection:
      "column",
    gap:
      "5px",
    color:
      "#46536b",
    fontSize:
      "10px",
    fontWeight:
      "800",
    textAlign:
      "left",
  },

  fieldInput: {
    width:
      "100%",
    minHeight:
      "38px",
    padding:
      "0 10px",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    color:
      "#2a3a55",
    fontSize:
      "11px",
    outline:
      "none",
  },

  miscuePanel: {
    maxWidth:
      "760px",
    margin:
      "14px auto 0",
    padding:
      "14px",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "9px",
    background:
      "#ffffff",
  },

  miscueTitle: {
    marginBottom:
      "9px",
    color:
      "#2a3a55",
    fontSize:
      "11px",
    fontWeight:
      "900",
    textAlign:
      "left",
  },

  miscueGrid: {
    display:
      "grid",
    gridTemplateColumns:
      "90px 1fr 1fr",
    gap:
      "9px",
  },

  secondaryButton: {
    minHeight:
      "39px",
    marginTop:
      "10px",
    padding:
      "0 14px",
    border:
      "1px solid #c7d2e0",
    borderRadius:
      "8px",
    background:
      "#edf1f7",
    color:
      "#1a2b4c",
    fontSize:
      "10px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  primary: {
    minHeight:
      "41px",
    padding:
      "0 15px",
    marginTop:
      "8px",
    border:
      0,
    borderRadius:
      "8px",
    background:
      "#1a2b4c",
    color:
      "#ffffff",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  outlineDanger: {
    minHeight:
      "46px",
    padding:
      "0 18px",
    border:
      "1px solid #ebc9c4",
    borderRadius:
      "14px",
    background:
      "#f8eae8",
    color:
      "#c0392b",
    fontSize:
      "14px",
    fontWeight:
      "900",
    cursor:
      "pointer",
    boxShadow: "none",
  },

  endSessionButton: {
    flex:
      "0 0 auto",
    minHeight:
      "48px",
    padding:
      "0 19px",
    border:
      "1px solid #ebc9c4",
    borderRadius:
      "14px",
    background:
      "#f8eae8",
    color:
      "#c0392b",
    fontSize:
      "15px",
    fontWeight:
      "950",
    cursor:
      "pointer",
    boxShadow:
      "none",
  },

  backDashboardButton: {
    flex:
      "0 0 auto",
    minHeight:
      "48px",
    padding:
      "0 19px",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "14px",
    background:
      "#ffffff",
    color:
      "#1a2b4c",
    fontSize:
      "15px",
    fontWeight:
      "900",
    cursor:
      "pointer",
    boxShadow:
      "none",
  },

  outlineDangerLegacy: {
    minHeight:
      "38px",
    padding:
      "0 13px",
    border:
      "1px solid #ebc9c4",
    borderRadius:
      "8px",
    background:
      "#f8eae8",
    color:
      "#c0392b",
    fontWeight:
      "800",
    cursor:
      "pointer",
  },

  card: {
    width:
      "100%",
    maxWidth:
      "430px",
    margin:
      "0 auto",
    padding:
      "24px",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "12px",
    background:
      "#ffffff",
    boxShadow: "none",
  },

  loadingContent: {
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "10px",
    fontSize:
      "15px",
    fontWeight:
      "800",
  },

  spinner: {
    width:
      "22px",
    height:
      "22px",
    border:
      "3px solid #dce3ec",
    borderTopColor:
      "#1a2b4c",
    borderRadius:
      "50%",
    animation:
      "crlAssessmentSpin .75s linear infinite",
  },

  observationModalOverlay: {
    position:
      "fixed",
    inset:
      0,
    zIndex:
      9999,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding:
      "20px",
    background:
      "rgba(8,24,42,.82)",
    backdropFilter:
      "blur(7px)",
    WebkitBackdropFilter:
      "blur(7px)",
    animation:
      "crlModalFade .16s ease-out",
  },

  optionalLabel: {
    fontWeight:
      "700",
    color:
      "#6b7789",
    fontSize:
      "13px",
  },

  observationModal: {
    width:
      "100%",
    maxWidth:
      "520px",
    padding:
      "28px",
    boxSizing:
      "border-box",
    border:
      "1px solid #dce3ec",
    borderRadius:
      "18px",
    background:
      "#fafafa",
    boxShadow: "none",
  },

  observationIcon: {
    width:
      "56px",
    height:
      "56px",
    margin:
      "0 auto 12px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "50%",
    background:
      "#edf1f7",
    fontSize:
      "30px",
  },

  observationTitle: {
    margin:
      0,
    textAlign:
      "center",
    color:
      "#2a3a55",
    fontSize:
      "30px",
    fontWeight:
      "950",
  },

  observationSubtitle: {
    margin:
      "9px auto 20px",
    maxWidth:
      "440px",
    color:
      "#6b7789",
    fontSize:
      "15px",
    lineHeight:
      1.6,
    textAlign:
      "center",
  },

  observationField: {
    display:
      "flex",
    flexDirection:
      "column",
    gap:
      "8px",
    marginTop:
      "14px",
    color:
      "#1a2b4c",
    fontSize:
      "15px",
    fontWeight:
      "900",
    width:
      "100%",
    boxSizing:
      "border-box",
  },

  observationSelect: {
    width:
      "100%",
    minHeight:
      "52px",
    padding:
      "0 11px",
    border:
      "1px solid #c7d2e0",
    borderRadius:
      "9px",
    background:
      "#ffffff",
    color:
      "#2a3a55",
    fontSize:
      "15px",
    outline:
      "none",
  },

  observationTextarea: {
    width:
      "100%",
    maxWidth:
      "100%",
    boxSizing:
      "border-box",
    display:
      "block",
    minHeight:
      "155px",
    padding:
      "11px",
    resize:
      "vertical",
    border:
      "1px solid #c7d2e0",
    borderRadius:
      "9px",
    background:
      "#ffffff",
    color:
      "#2a3a55",
    fontSize:
      "15px",
    lineHeight:
      1.55,
    outline:
      "none",
    fontFamily:
      "Arial, Helvetica, sans-serif",
  },

  observationError: {
    marginTop:
      "10px",
    padding:
      "9px 10px",
    border:
      "1px solid #ebc9c4",
    borderRadius:
      "8px",
    background:
      "#f8eae8",
    color:
      "#9b2e22",
    fontSize:
      "10px",
    lineHeight:
      1.5,
  },

  observationSaveButton: {
    width:
      "100%",
    boxSizing:
      "border-box",
    minHeight:
      "44px",
    marginTop:
      "16px",
    padding:
      "0 14px",
    border:
      0,
    borderRadius:
      "9px",
    background:
      "#1a2b4c",
    color:
      "#ffffff",
    fontSize:
      "11px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  modalOverlay: {
    position:
      "fixed",
    inset:
      0,
    zIndex:
      1000,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding:
      "20px",
    background:
      "rgba(17,32,51,.38)",
    backdropFilter:
      "blur(3px)",
    animation:
      "crlModalFade .16s ease-out",
  },

  finishReadingModal: {
    width: "min(570px,94vw)",
    padding: "32px",
    borderRadius: "24px",
    background: "#fafafa",
    border: "1px solid #dce3ec",
    boxShadow: "none",
    textAlign: "center",
  },

  finishReadingIcon: {
    width: "58px",
    height: "58px",
    margin: "0 auto 14px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "#e8f0ea",
    color: "#2f5f49",
    fontSize: "27px",
    fontWeight: "950",
    boxShadow: "none",
  },

  finishReadingTitle: {
    margin: "0",
    color: "#2a3a55",
    fontSize: "28px",
    fontWeight: "950",
  },

  finishReadingText: {
    margin: "12px 0 22px",
    color: "#6b7789",
    fontSize: "17px",
    lineHeight: 1.6,
  },

  confirmModal: {
    width:
      "min(560px,94vw)",
    padding:
      "30px",
    borderRadius:
      "24px",
    background:
      "#fafafa",
    border:
      "1px solid #dce3ec",
    boxShadow:
      "none",
    textAlign:
      "center",
  },


  confirmIcon: {
    width:
      "50px",
    height:
      "50px",
    margin:
      "0 auto 12px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "50%",
    background:
      "#f8eae8",
    color:
      "#c0392b",
    fontSize:
      "23px",
    fontWeight:
      "900",
  },

  confirmTitle: {
    margin:
      "0",
    color:
      "#2a3a55",
    fontSize:
      "26px",
    fontWeight:
      "950",
    textAlign:
      "center",
  },


  confirmText: {
    margin:
      "12px auto 0",
    maxWidth:
      "470px",
    color:
      "#6b7789",
    fontSize:
      "16px",
    lineHeight:
      1.65,
    textAlign:
      "center",
  },


  confirmActions: {
    display:
      "flex",
    justifyContent:
      "center",
    alignItems:
      "center",
    gap:
      "12px",
    marginTop:
      "22px",
  },

  cancelButton: {
    minHeight:
      "48px",
    padding:
      "0 20px",
    border:
      "1px solid #c7d2e0",
    borderRadius:
      "13px",
    background:
      "#edf1f7",
    color:
      "#2a3a55",
    fontSize:
      "15px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },


  confirmButton: {
    minHeight:
      "48px",
    padding:
      "0 20px",
    border:
      0,
    borderRadius:
      "13px",
    background:
      "#d9534f",
    color:
      "#ffffff",
    fontSize:
      "15px",
    fontWeight:
      "950",
    cursor:
      "pointer",
  },


  busySpinner: {
    width:
      "14px",
    height:
      "14px",
    border:
      "2px solid #dce3ec",
    borderTopColor:
      "#1a2b4c",
    borderRadius:
      "50%",
    animation:
      "crlAssessmentSpin .7s linear infinite",
  },

  busy: {
    position:
      "fixed",
    right:
      "20px",
    bottom:
      "20px",
    padding:
      "10px 14px",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    border:
      "1px solid #dce3ec",
    color:
      "#1a2b4c",
    fontSize:
      "10px",
    fontWeight:
      "900",
    boxShadow: "none",
  },
};
