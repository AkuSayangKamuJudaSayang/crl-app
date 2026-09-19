import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET ||
  "";

const CONNECTION_TIMEOUT_MS = 30000;

// Keep API behavior explicit across local Codespaces and Vercel deployments.
const API_VERSION = "2026-08-30-assessment-v2";

const LETTERS = [
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

const WORDS = [
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

const COMPREHENSION_QUESTION_COUNT = 6;
const PASSAGE_MISCUE_TYPES = new Set([
  "Insertion",
  "Omission",
  "Substitution",
  "Repetition",
  "SelfCorrection",
  "Reversion",
]);

function normalizePassageMiscueSnapshot(value) {
  if (!Array.isArray(value)) return null;

  const byWordIndex = new Map();
  for (const item of value) {
    const wordIndex = Number(item?.wordIndex ?? item?.word_index);
    const miscueType = String(item?.miscueType ?? item?.miscue_type ?? "").trim();
    const misreadWord = String(item?.misreadWord ?? item?.misread_word ?? "").trim();

    if (
      !Number.isInteger(wordIndex) ||
      wordIndex < 0 ||
      wordIndex >= 100 ||
      !PASSAGE_MISCUE_TYPES.has(miscueType)
    ) {
      return null;
    }

    byWordIndex.set(wordIndex, {
      wordIndex,
      miscueType,
      misreadWord: misreadWord || null,
    });
  }

  return Array.from(byWordIndex.values()).sort(
    (left, right) => left.wordIndex - right.wordIndex
  );
}

function normalizeComprehensionSnapshot(value) {
  if (!Array.isArray(value)) return null;

  const byQuestionIndex = new Map();
  for (const item of value) {
    const questionIndex = Number(item?.questionIndex ?? item?.question_index);
    if (
      !Number.isInteger(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= COMPREHENSION_QUESTION_COUNT
    ) {
      return null;
    }

    byQuestionIndex.set(questionIndex, {
      questionIndex,
      isCorrect: Boolean(item?.isCorrect ?? item?.is_correct),
    });
  }

  return Array.from(byQuestionIndex.values()).sort(
    (left, right) => left.questionIndex - right.questionIndex
  );
}

async function replacePassageMiscues(tx, sessionId, miscues) {
  await tx.passageMiscue.deleteMany({ where: { sessionId } });
  if (miscues.length) {
    await tx.passageMiscue.createMany({
      data: miscues.map((miscue) => ({ sessionId, ...miscue })),
    });
  }
}

async function replaceComprehensionResults(tx, sessionId, results) {
  /*
   * A comprehension snapshot is only ever complete (all six questions) when
   * Part 2 was actually administered. An empty or missing snapshot must
   * therefore never be allowed to clear rows that were already recorded -
   * that is exactly how a marked 3/6 could be rewritten as 0/6.
   */
  if (!Array.isArray(results) || results.length === 0) return;

  await tx.comprehensionResult.deleteMany({ where: { sessionId } });
  await tx.comprehensionResult.createMany({
    data: results.map((result) => ({ sessionId, ...result })),
  });
}

const PASSAGE_TEXT =
  'Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.';

function serializeAssessmentContent(items) {
  const result = {
    BoSY: { letters: [], words: [], stories: [] },
    MoSY: { letters: [], words: [], stories: [] },
    EoSY: { letters: [], words: [], stories: [] },
  };

  for (const item of items) {
    if (!result[item.assessmentPeriod]?.[item.category]) continue;

    if (item.category === "stories") {
      result[item.assessmentPeriod].stories.push({
        id: item.id,
        title: item.storyTitle || "Untitled Story",
        text: item.content || "",
      });
    } else {
      result[item.assessmentPeriod][item.category].push(
        item.content || ""
      );
    }
  }

  return result;
}

const STORY_CHOICES = [
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
    available: false,
  },
];

const DEFAULT_CONTENT_FOR_PERIOD = {
  BoSY: {
    letters: ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"],
    words: ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"],
    stories: [
      { title: "Para the Parrot", text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books." },
      { title: "The Helpful Friend", text: "A child sees a friend carrying a heavy basket. The child helps carry it home." },
    ],
  },
  MoSY: {
    letters: ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"],
    words: ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"],
    stories: [
      { title: "A Morning Walk", text: "The children walk together and help one another on their way to school." },
    ],
  },
  EoSY: {
    letters: ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"],
    words: ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"],
    stories: [
      { title: "The Kind Child", text: "A kind child notices someone who needs help and chooses to lend a hand." },
    ],
  },
};


/*
 * The live content catalogue is read on nearly every hot assessment request:
 * each recorded letter and word validates against it, the teacher's host poll
 * embeds it, and the learner's rich status call loads it. On a small shared
 * connection pool that repeated identical query competes with the writes that
 * actually move the assessment forward, which is felt as later items trailing
 * the teacher's taps. Cache it briefly and invalidate on every content write.
 */
const LIVE_CONTENT_CACHE_TTL_MS = 15000;
const liveAssessmentContentCache = new Map();

function invalidateLiveAssessmentContent(teacherId) {
  if (teacherId === undefined || teacherId === null) {
    liveAssessmentContentCache.clear();
    return;
  }

  const prefix = `${Number(teacherId)}:`;
  for (const key of Array.from(liveAssessmentContentCache.keys())) {
    if (key.startsWith(prefix)) liveAssessmentContentCache.delete(key);
  }
}

async function getLiveAssessmentContent(teacherId, assessmentPeriod) {
  const normalizedPeriod = normalizePeriod(assessmentPeriod) || "BoSY";
  const cacheKey = `${Number(teacherId)}:${normalizedPeriod}`;
  const cached = liveAssessmentContentCache.get(cacheKey);

  if (cached && Date.now() - cached.savedAt < LIVE_CONTENT_CACHE_TTL_MS) {
    return cached.value;
  }

  const rows = await prisma.assessmentContent.findMany({
    where: { teacherId, assessmentPeriod: normalizedPeriod },
    orderBy: [{ category: "asc" }, { position: "asc" }],
  });

  const value = {
    letters: rows.filter((row) => row.category === "letters").map((row) => row.content || ""),
    words: rows.filter((row) => row.category === "words").map((row) => row.content || ""),
    stories: rows.filter((row) => row.category === "stories").map((row) => ({
      id: row.id,
      title: row.storyTitle || "Untitled Story",
      description: "Story passage from Manage Assessment.",
      text: row.content || "",
      available: Boolean(String(row.content || "").trim()),
    })),
  };

  liveAssessmentContentCache.set(cacheKey, { savedAt: Date.now(), value });

  return value;
}

function responseJson(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "X-CRL-API-Version": API_VERSION,
    },
  });
}

function normalizeCode(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

function normalizePeriod(value) {
  const valueNormalized = String(value || "")
    .trim()
    .toLowerCase();

  if (valueNormalized === "bosy") {
    return "BoSY";
  }

  if (valueNormalized === "mosy") {
    return "MoSY";
  }

  if (valueNormalized === "eosy") {
    return "EoSY";
  }

  return null;
}

function middleInitial(value) {
  const middleName = String(value || "").trim();

  if (!middleName) {
    return "";
  }

  return `${middleName.charAt(0).toUpperCase()}.`;
}

function serializeLearner(learner) {
  if (!learner) {
    return null;
  }

  return {
    id: learner.id,
    lrn: learner.lrn,
    first_name: learner.firstName,
    middle_name: learner.middleName || "",
    middle_initial: middleInitial(
      learner.middleName
    ),
    last_name: learner.lastName,
    suffix: learner.suffix || "",
    sex: learner.sex || "",
    grade_level: learner.gradeLevel,
    section: learner.section || "",
    created_at: learner.createdAt,
  };
}

function isRecentlyConnected(linkedAt) {
  if (!linkedAt) {
    return false;
  }

  const timestamp = new Date(
    linkedAt
  ).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return false;
  }

  return (
    Date.now() - timestamp <=
    CONNECTION_TIMEOUT_MS
  );
}

function getTokenFromRequest(request) {
  const cookieToken =
    request.cookies.get(
      "crla_token"
    )?.value;

  if (cookieToken) {
    return cookieToken;
  }

  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    authorization &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization.substring(7);
  }

  return null;
}

async function getAuthenticatedUser(
  request
) {
  const token =
    getTokenFromRequest(request);

  if (
    !token ||
    !JWT_SECRET
  ) {
    return null;
  }

  try {
    const secret =
      new TextEncoder().encode(
        JWT_SECRET
      );

    const verified =
      await jwtVerify(
        token,
        secret
      );

    return verified.payload;
  } catch {
    return null;
  }
}

async function requireTeacher(
  request
) {
  const payload =
    await getAuthenticatedUser(
      request
    );

  if (!payload) {
    return {
      error: responseJson(
        {
          error:
            "Authentication required.",
        },
        401
      ),
    };
  }

  const role = String(
    payload.role || ""
  ).toLowerCase();

  if (
    role !== "teacher" &&
    role !== "admin"
  ) {
    return {
      error: responseJson(
        {
          error:
            "Teacher access required.",
        },
        403
      ),
    };
  }

  const id = Number(
    payload.id ??
      payload.sub ??
      0
  );

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return {
      error: responseJson(
        {
          error:
            "Invalid authenticated user.",
        },
        401
      ),
    };
  }

  return {
    user: payload,
    userId: id,
  };
}

function getActionFromRequest(
  request,
  body
) {
  let action =
    request.nextUrl.searchParams.get(
      "action"
    );

  if (!action) {
    action = body?.action;
  }

  action = String(
    action || ""
  )
    .trim()
    .toLowerCase();

  /*
   * Your current learner page is sending:
   *
   * {
   *   "action": "host_join",
   *   "code": "WU94LB"
   * }
   *
   * We intentionally support that older action name.
   */
  // Accept all learner-join spellings used by the current/previous clients.
  if (
    action === "host_join" ||
    action === "host-join" ||
    action === "join" ||
    action === "learner_join" ||
    action === "learner-join"
  ) {
    return "learner_join";
  }

  // Normalize a few common heartbeat/finish aliases as well.
  if (
    action === "heartbeat" ||
    action === "learner-heartbeat"
  ) {
    return "learner_heartbeat";
  }

  if (
    action === "finish" ||
    action === "complete" ||
    action === "learner-complete"
  ) {
    return "learner_finish";
  }

  return action;
}

function getPassageWordCount() {
  return PASSAGE_TEXT
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function getStoryNumber(title) {
  const normalized = String(title || "").trim().toLowerCase();
  if (normalized === "para the parrot") return 1;
  if (normalized === "a day in the fields") return 2;
  return null;
}

function getPassageWords(text) {
  return String(text || PASSAGE_TEXT)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function getRecordedPassageMetrics(
  metrics,
  passageWordCount = getPassageWordCount()
) {
  const totalPart1Score =
    Number(metrics?.task1Score || 0) +
    Number(metrics?.task2Score || 0);
  const timerSeconds = metrics?.timerSeconds;
  const passageWasAdministered =
    totalPart1Score > 10 &&
    timerSeconds !== null &&
    timerSeconds !== undefined;

  if (!passageWasAdministered) {
    return {
      passageWasAdministered: false,
      wordsRead: 0,
      wpm: null,
    };
  }

  const wordsRead = Math.max(
    0,
    Number(passageWordCount || 0) -
      Number(metrics?.totalMiscues || 0)
  );

  return {
    passageWasAdministered: true,
    wordsRead,
    wpm:
      Number(timerSeconds) > 0
        ? Number(((wordsRead / Number(timerSeconds)) * 60).toFixed(2))
        : null,
  };
}

async function findHostByCode(
  code
) {
  return prisma.hostSession.findUnique(
    {
      where: {
        code,
      },
      include: {
        learner: true,
        teacher: true,
        assessmentSession: {
          include: {
            sessionMetrics: true,
            letterResults: { orderBy: { letterIndex: "asc" } },
            wordResults: { orderBy: { wordIndex: "asc" } },
            passageMiscues: { orderBy: { wordIndex: "asc" } },
            comprehensionResults: { orderBy: { questionIndex: "asc" } },
          },
        },
      },
    }
  );
}

function calculatePart1ReadingLevel(totalScore) {
  const total = Number(totalScore || 0);

  if (total === 0) {
    return "Full Refresher";
  }

  if (total <= 10) {
    return "Moderate Refresher";
  }

  if (total <= 16) {
    return "Light Refresher";
  }

  return "Grade Ready";
}

function calculatePart1Profile(
  task1Score,
  task2Score,
  task1Complete,
  task2Complete
) {
  /*
   * CRLA Grade 3 English Part 1 follows the workbook's cumulative score:
   *
   * Task 1 = 0, once complete
   *   -> Low Emerging Reader / Full Refresher
   *   -> stop and record
   *
   * Once Task 2 is complete:
   *   Total 0      -> Full Refresher
   *   Total 1-10   -> Moderate Refresher / Low Emerging
   *   Total 11-16  -> Light Refresher / High Emerging
   *   Total 17-20  -> Grade Ready / High Emerging
   *
   * The workbook's "Total Score" is Task 1 + Task 2.
   */
  const totalScore =
    Number(task1Score || 0) +
    Number(task2Score || 0);

  if (
    task1Complete &&
    Number(task1Score || 0) === 0
  ) {
    return {
      profile:
        "Low Emerging Reader",
      refresher:
        "Full Refresher",
      hardTerminate:
        true,
      hardTerminateStage:
        "letter",
    };
  }

  if (!task2Complete) {
    if (task1Complete) {
      return {
        profile:
          "Low Emerging Reader",
        refresher:
          "Moderate Refresher",
        hardTerminate:
          false,
        hardTerminateStage:
          null,
      };
    }

    return {
      profile: null,
      refresher: null,
      hardTerminate: false,
      hardTerminateStage: null,
    };
  }

  if (totalScore === 0) {
    return {
      profile:
        "Low Emerging Reader",
      refresher:
        "Full Refresher",
      hardTerminate:
        false,
      hardTerminateStage:
        null,
    };
  }

  if (totalScore <= 10) {
    return {
      profile:
        "Low Emerging Reader",
      refresher:
        "Moderate Refresher",
      hardTerminate:
        true,
      hardTerminateStage:
        "word",
    };
  }

  if (totalScore <= 16) {
    return {
      profile:
        "High Emerging Reader",
      refresher:
        "Light Refresher",
      hardTerminate:
        false,
      hardTerminateStage:
        null,
    };
  }

  return {
    profile:
      "High Emerging Reader",
    refresher:
      "Grade Ready",
    hardTerminate:
      false,
    hardTerminateStage:
      null,
  };
}

function calculatePart2Profile(
  accuracy,
  comprehensionScore
) {
  const readingAccuracy = Number(
    accuracy || 0
  );

  const comprehension = Number(
    comprehensionScore || 0
  );

  /*
   * CRLA Grade 3 English Part 2:
   * <=25%                    -> High Emerging
   * 26-50% + 0              -> High Emerging
   * 26-50% + 1-6            -> Developing
   * 51-75% + 0-2            -> Developing
   * 51-75% + 3-6            -> Transitioning
   * 76-100% + 0-4           -> Transitioning
   * 76-100% + 5-6           -> Reading At Grade Level
   */
  if (
    readingAccuracy <= 25
  ) {
    return "High Emerging Reader";
  }

  if (
    readingAccuracy >= 26 &&
    readingAccuracy <= 50
  ) {
    return comprehension === 0
      ? "High Emerging Reader"
      : "Developing Reader";
  }

  if (
    readingAccuracy >= 51 &&
    readingAccuracy <= 75
  ) {
    return comprehension <= 2
      ? "Developing Reader"
      : "Transitioning Reader";
  }

  if (
    readingAccuracy >= 76 &&
    readingAccuracy <= 100
  ) {
    return comprehension <= 4
      ? "Transitioning Reader"
      : "Reading At Grade Level";
  }

  return "High Emerging Reader";
}

function calculateClassification(
  task1Score,
  task2Score,
  task1Complete,
  task2Complete,
  miscueAccuracy,
  comprehensionScore,
  passageStarted
) {
  const totalPart1Score =
    Number(task1Score || 0) +
    Number(task2Score || 0);

  // The Grade 3 English scoresheet assigns every Part 1 total from 0–10
  // to Low Emerging before applying the Part 2 fluency/comprehension formula.
  if (totalPart1Score <= 10) {
    return "Low Emerging Reader";
  }

  const part1 =
    calculatePart1Profile(
      task1Score,
      task2Score,
      task1Complete,
      task2Complete
    );

  if (
    passageStarted
  ) {
    return calculatePart2Profile(
      miscueAccuracy,
      comprehensionScore
    );
  }

  return (
    part1.profile ||
    null
  );
}

async function safeCalculateMetrics(assessmentSessionId) {
  try {
    return await calculateMetrics(prisma, assessmentSessionId);
  } catch (error) {
    /*
     * Scoring persistence must never prevent the live assessment from
     * advancing. The task result is already the source-of-truth row; a
     * transient metrics/transaction problem can be recovered on the next
     * assessment request/finalization.
     */
    console.error("Assessment metrics update failed:", error);
    return {
      metrics: null,
      task1Score: null,
      task2Score: null,
      totalPart1Score: null,
      part1ReadingLevel: null,
      task1Complete: false,
      task2Complete: false,
      totalMiscues: null,
      wordsRead: null,
      passageWordCount: getPassageWordCount(),
      miscueAccuracy: null,
      wpm: null,
      comprehensionScore: null,
      classification: null,
      hardTerminate: false,
      hardTerminateStage: null,
      part1Profile: null,
      part1Refresher: null,
      passageStarted: false,
      metricsPending: true,
    };
  }
}

async function calculateMetrics(
  tx,
  assessmentSessionId
) {
  const [
    letters,
    words,
    miscues,
    comprehension,
  ] = await Promise.all([
    tx.letterTaskResult.findMany({
      where: {
        sessionId:
          assessmentSessionId,
      },
      orderBy: {
        letterIndex: "asc",
      },
    }),

    tx.wordTaskResult.findMany({
      where: {
        sessionId:
          assessmentSessionId,
      },
      orderBy: {
        wordIndex: "asc",
      },
    }),

    tx.passageMiscue.findMany({
      where: {
        sessionId:
          assessmentSessionId,
      },
      orderBy: {
        wordIndex: "asc",
      },
    }),

    tx.comprehensionResult.findMany({
      where: {
        sessionId:
          assessmentSessionId,
      },
      orderBy: {
        questionIndex: "asc",
      },
    }),
  ]);

  const task1Score =
    letters.filter(
      (result) =>
        result.isCorrect
    ).length;

  const task2Score =
    words.filter(
      (result) =>
        result.isCorrect
    ).length;

  const task1Complete =
    letters.length >=
    LETTERS.length;

  const task2Complete =
    words.length >=
    WORDS.length;

  const totalPart1Score =
    task1Score +
    task2Score;

  const part1ReadingLevel =
    calculatePart1ReadingLevel(
      totalPart1Score
    );

  const totalMiscues =
    miscues.length;

  const comprehensionScore =
    comprehension.filter(
      (result) =>
        result.isCorrect
    ).length;

  const part1 =
    calculatePart1Profile(
      task1Score,
      task2Score,
      task1Complete,
      task2Complete
    );

  /*
   * A zero Task 1 score and a completed Part 1 total of 10 or less are
   * official early-stop conditions. Part 2 was not administered, so its
   * passage metrics must not be manufactured from an empty result set.
   */
  const isPart1EarlyStop =
    Boolean(part1.hardTerminate);

  const passageWordCount =
    getPassageWordCount();

  const existingSessionMetrics =
    await tx.sessionMetrics.findUnique({
      where: {
        sessionId:
          assessmentSessionId,
      },
    });

  const timerSeconds =
    isPart1EarlyStop
      ? null
      : existingSessionMetrics?.timerSeconds ??
        null;

  const passageStarted =
    !isPart1EarlyStop &&
    (
      miscues.length > 0 ||
      comprehension.length > 0 ||
      timerSeconds !== null
    );

  const wordsRead =
    passageStarted
      ? Math.max(
          0,
          passageWordCount -
            totalMiscues
        )
      : 0;

  const miscueAccuracy =
    passageStarted
      ? Number(
          wordsRead.toFixed(2)
        )
      : 0;

  const wpm =
    isPart1EarlyStop
      ? null
      : timerSeconds &&
          timerSeconds > 0
        ? Number(
            (
              (wordsRead /
                timerSeconds) *
              60
            ).toFixed(2)
          )
        : null;

  const hardTerminate =
    Boolean(
      part1.hardTerminate
    );

  const classification =
    calculateClassification(
      task1Score,
      task2Score,
      task1Complete,
      task2Complete,
      miscueAccuracy,
      comprehensionScore,
      passageStarted
    );

  const metrics =
    await tx.sessionMetrics.upsert({
      where: {
        sessionId:
          assessmentSessionId,
      },
      update: {
        task1Score,
        task2Score,
        totalMiscues,
        miscueAccuracy,
        comprehensionScore,
        timerSeconds,
        classificationLabel:
          classification,
      },
      create: {
        sessionId:
          assessmentSessionId,
        task1Score,
        task2Score,
        totalMiscues,
        miscueAccuracy,
        comprehensionScore,
        timerSeconds,
        classificationLabel:
          classification,
      },
    });

  return {
    metrics,
    task1Score,
    task2Score,
    totalPart1Score,
    part1ReadingLevel,
    task1Complete,
    task2Complete,
    totalMiscues,
    wordsRead,
    passageWordCount,
    miscueAccuracy,
    wpm,
    comprehensionScore,
    classification,
    hardTerminate,
    hardTerminateStage:
      part1.hardTerminateStage,
    part1Profile:
      part1.profile,
    part1Refresher:
      part1.refresher,
    passageStarted,
  };
}

async function completeEarlyTermination(
  hostId,
  assessmentSessionId,
  scoring
) {
  const stoppedAfterTask1 = scoring?.hardTerminateStage === "letter";

  return prisma.$transaction(
    async (tx) => {
      const assessment =
        await tx.assessmentSession.update(
          {
            where: {
              id:
                assessmentSessionId,
            },
          data: {
            isCompleted:
              false,
            overallClassification:
              scoring.classification,
            },
          }
        );

      await tx.hostSession.update(
        {
          where: {
            id: hostId,
          },
          data: {
            ended: false,
            stage:
              "terminated",
            currentContent:
              stoppedAfterTask1
                ? "ZERO_SCORE_PART1_TASK1"
                : "PART1_TOTAL_LOW",
            linkedAt: new Date(),
          },
        }
      );

      return assessment;
    }
  );
}

function generateAssessmentCode(
  length = 6
) {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result = "";

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    result +=
      characters[
        Math.floor(
          Math.random() *
            characters.length
        )
      ];
  }

  return result;
}

async function generateUniqueCode() {
  for (
    let attempt = 0;
    attempt < 50;
    attempt += 1
  ) {
    const code =
      generateAssessmentCode();

    const existing =
      await prisma.hostSession.findUnique(
        {
          where: {
            code,
          },
        }
      );

    if (!existing) {
      return code;
    }
  }

  throw new Error(
    "Unable to generate a unique assessment code."
  );
}

/* ========================================================================== */
/* GET                                                                        */
/* ========================================================================== */

// CRL_ASSESSMENT_FLOW_FULL_SEQUENCE

export async function GET(
  request
) {
  const action =
    getActionFromRequest(
      request,
      {}
    );

  /*
   * Learner status does not require teacher authentication.
   */
  /*
   * Lean position poll. The learner asks for its current item several times a
   * second, and the full learner_status payload (learner record, session
   * metrics, whole content catalogue) is far too heavy for that cadence - it is
   * what made item updates take seconds. This touches one row and returns only
   * what the live UI needs. learner_status remains the rich call used on stage
   * changes, story content, experience overlays and completion handling.
   */
  if (action === "learner_position") {
    const code = normalizeCode(
      request.nextUrl.searchParams.get("code")
    );

    if (!code) {
      return responseJson(
        { error: "Assessment code is required." },
        400
      );
    }

    try {
      const host = await prisma.hostSession.findUnique({
        where: { code },
        select: {
          stage: true,
          currentContent: true,
          storyTitle: true,
          ended: true,
          learnerId: true,
          linkedAt: true,
          updatedAt: true,
          passageStartedAt: true,
          passagePausedAt: true,
          passagePausedSeconds: true,
          teacherId: true,
          assessmentSession: {
            select: { assessmentPeriod: true },
          },
        },
      });

      if (!host) {
        return responseJson(
          { error: "Assessment session not found." },
          404
        );
      }

      /*
       * The story-choice screen needs the actual story list (titles and ids).
       * The lean position payload intentionally omits the content catalogue to
       * stay cheap at several polls per second, which left the learner waiting
       * on the much heavier learner_status call before it could render real
       * story choices. Fetch the catalogue only while that stage is live.
       */
      let storyChoices = null;
      if (String(host.stage || "") === "story_choice") {
        try {
          const liveContent = await getLiveAssessmentContent(
            host.teacherId,
            host.assessmentSession?.assessmentPeriod || "BoSY"
          );
          storyChoices = liveContent.stories;
        } catch {
          storyChoices = null;
        }
      }

      return responseJson({
        status: "ok",
        position_only: true,
        connected:
          !host.ended &&
          Boolean(host.learnerId) &&
          (
            Boolean(host.linkedAt) ||
            (
              host.stage !== "waiting" &&
              host.stage !== "connected"
            )
          ),
        ended: host.ended,
        stage: host.stage,
        current_content: host.currentContent,
        story_title: host.storyTitle,
        updated_at: host.updatedAt,
        passage_started_at: host.passageStartedAt,
        passage_paused_at: host.passagePausedAt,
        passage_paused_seconds: host.passagePausedSeconds,
        ...(storyChoices ? { story_choices: storyChoices } : {}),
      });
    } catch (error) {
      console.error("learner_position error:", error);

      return responseJson(
        { error: "Unable to retrieve assessment position." },
        500
      );
    }
  }

  if (
    action ===
    "learner_status"
  ) {
    const code =
      normalizeCode(
        request.nextUrl.searchParams.get(
          "code"
        )
      );

    if (!code) {
      return responseJson(
        {
          error:
            "Assessment code is required.",
        },
        400
      );
    }

    try {
      // Lean read for the high-frequency learner-status path.
      // Avoid loading metrics and unrelated teacher data on every poll.
      const host =
        await prisma.hostSession.findUnique({
          where: { code },
          select: {
            id: true,
            code: true,
            learnerId: true,
            teacherId: true,
            linkedAt: true,
            ended: true,
            stage: true,
            currentContent: true,
            storyTitle: true,
            passageStartedAt: true,
            passagePausedAt: true,
            passagePausedSeconds: true,
            learner: true,
            assessmentSession: {
              select: {
                isCompleted: true,
                assessmentPeriod: true,
                sessionMetrics: {
                  select: {
                    task1Score: true,
                    task2Score: true,
                    comprehensionScore: true,
                    totalMiscues: true,
                    timerSeconds: true,
                    },
                },
              },
            },
          },
        });

      if (!host) {
        return responseJson(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      // Once a learner has joined an open session, keep the
      // session connected until the teacher explicitly ends it. Heartbeat
      // timing must not make the UI jump back to "Waiting for learner".
      const connected =
        !host.ended &&
        Boolean(host.learnerId) &&
        (
          Boolean(host.linkedAt) ||
          (
            host.stage !== "waiting" &&
            host.stage !== "connected"
          )
        );

      const assessmentCompleted =
        Boolean(
          host
            .assessmentSession
            ?.isCompleted
        );

      const effectiveConnected =
        connected &&
        !assessmentCompleted;

      const assessmentPeriod =
        host.assessmentSession?.assessmentPeriod || "BoSY";

      /*
       * Always include the story catalogue. Gating this to the story stages
       * saved one query per poll but risked leaving the learner without story
       * choices or passage text when a stage transition and a poll raced, which
       * showed up as a blank story/passage container on the learner device.
       * Correctness first: the learner must always be able to resolve its item.
       */
      const liveAssessmentContent = await getLiveAssessmentContent(
        host.teacherId,
        assessmentPeriod
      );

      return responseJson({
        status: "ok",
        connected:
          effectiveConnected,
        completed:
          assessmentCompleted,
        ended: host.ended,
        stage:
          assessmentCompleted &&
          host.stage !==
            "terminated"
            ? "completed"
            : host.stage,
        current_content:
          host.currentContent,
        story_title:
          host.storyTitle,
        updated_at:
          host.updatedAt,
        passage_started_at:
          host.passageStartedAt,
        passage_paused_at:
          host.passagePausedAt,
        passage_paused_seconds:
          host.passagePausedSeconds,
        story_choices:
          liveAssessmentContent.stories,
        assessment_content:
          liveAssessmentContent,
        learner:
          serializeLearner(
            host.learner
          ),
        period:
          host
            .assessmentSession
            ?.assessmentPeriod ||
          null,
        metrics:
          host.assessmentSession?.sessionMetrics || null,
        early_termination:
          host.stage === "terminated" ||
          host.currentContent ===
            "ZERO_SCORE_PART1_TASK1"
            ? host.currentContent === "ZERO_SCORE_PART1_TASK1"
              ? "part1_task1_zero"
              : "part1_total_low"
            : null,
      });
    } catch (error) {
      console.error(
        "learner_status error:",
        error
      );

      return responseJson(
        {
          error:
            "Unable to retrieve assessment status.",
        },
        500
      );
    }
  }

  const auth =
    await requireTeacher(
      request
    );

  if (auth.error) {
    return auth.error;
  }

  const {
    userId,
  } = auth;

  try {

    /* ---------------------------------------------------------------------- */
    /* GET LEARNERS                                                           */
    /* ---------------------------------------------------------------------- */

    if (
      action ===
      "get_learners"
    ) {
      const learners =
        await prisma.learner.findMany(
          {
            where: {
              teacherId:
                userId,
            },
            orderBy: [
              {
                lastName:
                  "asc",
              },
              {
                firstName:
                  "asc",
              },
            ],
          }
        );

      return responseJson({
        status: "ok",
        learners:
          learners.map(
            serializeLearner
          ),
      });
    }

    /* ---------------------------------------------------------------------- */
    /* GET ASSESSMENTS                                                        */
    /* ---------------------------------------------------------------------- */

    if (action === "get_activities") {
      let items = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });

      if (!items.length) {
        const seed = [];
        for (const period of Object.keys(DEFAULT_CONTENT_FOR_PERIOD)) {
          const periodContent = DEFAULT_CONTENT_FOR_PERIOD[period];

          for (const category of ["letters", "words", "stories"]) {
            periodContent[category].forEach((item, index) => {
              seed.push({
                teacherId: userId,
                assessmentPeriod: period,
                category,
                position: index + 1,
                content: category === "stories" ? item.text : item,
                storyTitle: category === "stories" ? item.title : null,
              });
            });
          }
        }

        await prisma.assessmentContent.createMany({ data: seed });
        invalidateLiveAssessmentContent(userId);
        items = await prisma.assessmentContent.findMany({
          where: { teacherId: userId },
          orderBy: [
            { assessmentPeriod: "asc" },
            { category: "asc" },
            { position: "asc" },
          ],
        });
      }

      return responseJson({
        status: "ok",
        activities: serializeAssessmentContent(items),
      });
    }

    if (action === "save_activities") {
      const source = body?.content;

      if (!source || typeof source !== "object") {
        return responseJson(
          { error: "Activity content is required." },
          400
        );
      }

      const rows = [];

      for (const period of ["BoSY", "MoSY", "EoSY"]) {
        const periodContent = source?.[period];
        if (!periodContent) continue;

        for (const category of ["letters", "words", "stories"]) {
          const values = Array.isArray(periodContent?.[category])
            ? periodContent[category]
            : [];

          if (
            (category === "letters" || category === "words") &&
            values.length > 10
          ) {
            return responseJson(
              { error: "Maximum items is 10. Unable to save more." },
              400
            );
          }

          values.forEach((item, index) => {
            if (category === "stories") {
              const title = String(item?.title || "").trim();
              const text = String(item?.text || "").trim();

              if (title && text) {
                rows.push({
                  teacherId: userId,
                  assessmentPeriod: period,
                  category,
                  position: index + 1,
                  content: text,
                  storyTitle: title,
                });
              }
              return;
            }

            const value = String(item || "").trim();
            if (value) {
              rows.push({
                teacherId: userId,
                assessmentPeriod: period,
                category,
                position: index + 1,
                content: value,
                storyTitle: null,
              });
            }
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.assessmentContent.deleteMany({
          where: { teacherId: userId },
        });

        if (rows.length) {
          await tx.assessmentContent.createMany({ data: rows });
        }
      });

      // The catalogue the hot paths read has just changed.
      invalidateLiveAssessmentContent(userId);

      const saved = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });

      return responseJson({
        status: "ok",
        activities: serializeAssessmentContent(saved),
      });
    }

    if (
      action ===
      "get_assessments"
    ) {
      const periodValue =
        request.nextUrl.searchParams.get(
          "period"
        );

      const period =
        periodValue
          ? normalizePeriod(
              periodValue
            )
          : null;

      const sessions =
        await prisma.assessmentSession.findMany(
          {
            where: {
              teacherId:
                userId,
              isCompleted:
                true,
              ...(period
                ? {
                    assessmentPeriod:
                      period,
                  }
                : {}),
            },
            include: {
              learner: true,
              sessionMetrics:
                true,
            },
            orderBy: {
              dateAdministered:
                "desc",
            },
          }
        );

      return responseJson({
        status: "ok",
        assessments:
          sessions.map(
            (session) => ({
              id: session.id,

              learner_id:
                session.learnerId,

              teacher_id:
                session.teacherId,

              assessment_period:
                session.assessmentPeriod,

              date_administered:
                session.dateAdministered,

              overall_classification:
                session.overallClassification,

              is_completed:
                session.isCompleted,

              task1_score:
                session
                  .sessionMetrics
                  ?.task1Score ||
                0,

              task2_score:
                session
                  .sessionMetrics
                  ?.task2Score ||
                0,

              total_miscues:
                session
                  .sessionMetrics
                  ?.totalMiscues ||
                0,

              miscue_accuracy:
                getRecordedPassageMetrics(
                  session.sessionMetrics
                ).passageWasAdministered
                  ? Number(
                      session.sessionMetrics.miscueAccuracy
                    )
                  : 0,

              comprehension_score:
                session
                  .sessionMetrics
                  ?.comprehensionScore ||
                0,

              classification_label:
                session
                  .sessionMetrics
                  ?.classificationLabel ||
                null,

              timer_seconds:
                session
                  .sessionMetrics
                  ?.timerSeconds ??
                null,

              experience_rating:
                session
                  .sessionMetrics
                  ?.experienceRating ??
                null,

              observation_level:
                session
                  .sessionMetrics
                  ?.observationLevel ??
                null,

              remarks:
                session
                  .sessionMetrics
                  ?.remarks ||
                null,

              words_read:
                getRecordedPassageMetrics(
                  session.sessionMetrics
                ).wordsRead,

              wpm:
                getRecordedPassageMetrics(
                  session.sessionMetrics
                ).wpm,

                            learner:
                serializeLearner(
                  session.learner
                ),
            })
          ),
      });
    }

    /* ---------------------------------------------------------------------- */
    /* HOST GET                                                                */
    /* ---------------------------------------------------------------------- */

    if (
      action ===
      "host_get"
    ) {
      const code =
        normalizeCode(
          request.nextUrl.searchParams.get(
            "code"
          )
        );

      if (!code) {
        return responseJson(
          {
            error:
              "Assessment code is required.",
          },
          400
        );
      }

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
            },
            include: {
              learner: true,
              assessmentSession: {
                include: {
                  sessionMetrics:
                    true,
                  letterResults: {
                    orderBy: { letterIndex: "asc" },
                  },
                  wordResults: {
                    orderBy: { wordIndex: "asc" },
                  },
                  comprehensionResults: {
                    orderBy: { questionIndex: "asc" },
                  },
                  passageMiscues: {
                    orderBy: {
                      wordIndex:
                        "asc",
                    },
                  },
                },
              },
            },
          }
        );

      if (!host) {
        return responseJson(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      /*
       * Connection is monotonic after the learner claims the assessment.
       * Do not use heartbeat freshness to decide whether the teacher should
       * show Waiting; background throttling or a slow request can otherwise
       * make an active assessment regress visually.
       */
      const connected =
        !host.ended &&
        Boolean(host.learnerId) &&
        (
          Boolean(host.linkedAt) ||
          (
            host.stage !== "waiting" &&
            host.stage !== "connected"
          )
        );

      let stage = host.stage;
      let currentContent = host.currentContent;
      const task1Score = host.assessmentSession?.letterResults?.filter((item) => item.isCorrect).length || 0;
      const task2Score = host.assessmentSession?.wordResults?.filter((item) => item.isCorrect).length || 0;
      const totalPart1Score = task1Score + task2Score;

      if (
        connected &&
        (stage === "waiting" || stage === "connected")
      ) {
        stage = "letter";
        currentContent = host.currentContent || LETTERS[0];
      }

      /*
       * Only an unclaimed session may be displayed as Waiting. After linkedAt
       * is set, preserve the authoritative stage/current item until host_end.
       */
      if (!host.linkedAt && !connected) {
        stage = "waiting";
        currentContent = null;
      }

      const assessmentPeriod = host.assessmentSession?.assessmentPeriod || "BoSY";
      const liveAssessmentContent = await getLiveAssessmentContent(host.teacherId, assessmentPeriod);
      const liveStoryChoices = liveAssessmentContent.stories;
      const selectedStory = liveStoryChoices.find((story) =>
        String(story?.title || "").trim().toLowerCase() ===
        String(host.storyTitle || "").trim().toLowerCase()
      );
      const passageWords = getPassageWords(selectedStory?.text || host.currentContent);

      return responseJson({
        status: "ok",
        session: {
          id: host.id,
          code: host.code,
          teacher_id:
            host.teacherId,
          learner_id:
            host.learnerId,
          assessment_session_id:
            host.assessmentSessionId,
          stage,
          current_content:
            currentContent,
          story_title:
            host.storyTitle,
          ended:
            host.ended,
          connected,
          linked_at:
            host.linkedAt,
          updated_at:
            host.updatedAt,
          early_termination:
            host.stage === "terminated" ||
            host.currentContent === "ZERO_SCORE_PART1_TASK1"
              ? host.currentContent === "ZERO_SCORE_PART1_TASK1"
                ? "part1_task1_zero"
                : "part1_total_low"
              : null,
          passage_started_at:
            host.passageStartedAt,
          passage_paused_at:
            host.passagePausedAt,
          passage_paused_seconds:
            host.passagePausedSeconds,
          story_choices: liveStoryChoices,
          assessment_content: liveAssessmentContent,
          learner:
            serializeLearner(
              host.learner
            ),
          metrics:
            host
              .assessmentSession
              ?.sessionMetrics
              ? {
                  task1Score,

                  task2Score,

                  totalPart1Score,

                  part1ReadingLevel:
                    calculatePart1ReadingLevel(totalPart1Score),

                  totalMiscues:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .totalMiscues,

                  comprehensionScore:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .comprehensionScore,

                  timerSeconds:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .timerSeconds,

                  wpm:
                    getRecordedPassageMetrics(
                      host.assessmentSession.sessionMetrics,
                      passageWords.length
                    ).wpm,

                  readingAccuracy:
                    getRecordedPassageMetrics(
                      host.assessmentSession.sessionMetrics,
                      passageWords.length
                    ).passageWasAdministered
                      ? host.assessmentSession.sessionMetrics.miscueAccuracy
                      : 0,

                  classification:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .classificationLabel,

                  observationLevel:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .observationLevel,

                  remarks:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .remarks || "",

                  experienceRating:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .experienceRating ?? null,

                  wordsRead:
                    getRecordedPassageMetrics(
                      host.assessmentSession.sessionMetrics,
                      passageWords.length
                    ).wordsRead,

                  storyNumber:
                    getStoryNumber(host.storyTitle),

                  passageMiscues:
                    host
                      .assessmentSession
                      .passageMiscues
                      ?.map((miscue) => ({
                        wordIndex: miscue.wordIndex,
                        word: passageWords[Number(miscue.wordIndex)] || "",
                        miscueType: miscue.miscueType,
                        misreadWord:
                          miscue.misreadWord || "",
                      })) || [],
                }
              : {
                  passageMiscues: [],
                },
          // Keep the authoritative result rows with the session as well as
          // at the legacy top level. The teacher review is rendered from the
          // session snapshot and must never manufacture missing answers as
          // incorrect while a poll is in flight.
          task1Results:
            host.assessmentSession?.letterResults?.map((item) => ({
              index: item.letterIndex,
              content: item.letter,
              isCorrect: item.isCorrect,
            })) || [],
          task2Results:
            host.assessmentSession?.wordResults?.map((item) => ({
              index: item.wordIndex,
              content: item.word,
              isCorrect: item.isCorrect,
            })) || [],
          comprehensionResults:
            host.assessmentSession?.comprehensionResults?.map((item) => ({
              questionIndex: item.questionIndex,
              isCorrect: item.isCorrect,
            })) || [],
        },
        task1Results:
          host.assessmentSession?.letterResults?.map((item) => ({
            index: item.letterIndex,
            content: item.letter,
            isCorrect: item.isCorrect,
          })) || [],
        task2Results:
          host.assessmentSession?.wordResults?.map((item) => ({
            index: item.wordIndex,
            content: item.word,
            isCorrect: item.isCorrect,
          })) || [],
        comprehensionResults:
          host.assessmentSession?.comprehensionResults?.map((item) => ({
            questionIndex: item.questionIndex,
            isCorrect: item.isCorrect,
          })) || [],
      });
    }

    return responseJson(
      {
        error:
          `Unknown assessment action: ${action}`,
      },
      400
    );
  } catch (error) {
    console.error(
      "Assessment GET error:",
      error
    );

    return responseJson(
      {
        error:
          "Internal assessment server error.",
      },
      500
    );
  }
}

/* ========================================================================== */
/* POST                                                                       */
/* ========================================================================== */

export async function POST(
  request
) {
  let body = {};

  try {
    body = await request.json();
  } catch {
    // Keep the endpoint resilient to an empty/malformed JSON body.
    body = {};
  }

  const action =
    getActionFromRequest(
      request,
      body
    );

  if (!action) {
    return responseJson(
      {
        error:
          "Assessment action is required.",
      },
      400
    );
  }

  /* ======================================================================== */
  /* LEARNER JOIN                                                             */
  /* ======================================================================== */

  if (
    action ===
    "learner_join"
  ) {
    const code =
      normalizeCode(
        body?.code
      );

    if (!code) {
      return responseJson(
        {
          error:
            "Assessment code is required.",
        },
        400
      );
    }

    try {
      const host =
        await findHostByCode(
          code
        );

      if (!host) {
        return responseJson(
          {
            error:
              "Assessment code is invalid or no longer exists.",
          },
          404
        );
      }

      if (
        host.ended ||
        host
          .assessmentSession
          ?.isCompleted
      ) {
        return responseJson(
          {
            error:
              "This assessment session has already ended.",
          },
          410
        );
      }

      if (!host.learnerId || !host.learner) {
        return responseJson(
          {
            error:
              "No learner has been assigned to this assessment.",
          },
          409
        );
      }

      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim =
        await prisma.hostSession.updateMany({
          where: {
            id:
              host.id,
            ended:
              false,
            linkedAt:
              null,
          },
          data: {
            linkedAt:
              new Date(),
            stage:
              host.stage ===
                "waiting" ||
              host.stage ===
                "connected"
                ? "letter"
                : host.stage,
            currentContent:
              host.currentContent ||
              LETTERS[0],
          },
        });

      if (claim.count !== 1) {
        return responseJson(
          {
            error:
              "This assessment code has already been used and is no longer available.",
          },
          410
        );
      }

      const updated =
        await findHostByCode(
          code
        );

      if (!updated) {
        return responseJson(
          {
            error:
              "This assessment session is no longer available.",
          },
          410
        );
      }

      const assessmentPeriod =
        updated.assessmentSession?.assessmentPeriod || "BoSY";
      const liveAssessmentContent =
        await getLiveAssessmentContent(
          updated.teacherId,
          assessmentPeriod
        );

      return responseJson({
        status:
          "ok",
        connected:
          true,
        ended:
          false,
        stage:
          updated.stage,
        current_content:
          updated.currentContent,
        story_title:
          updated.storyTitle,
        story_choices:
          liveAssessmentContent.stories,
        assessment_content:
          liveAssessmentContent,
        learner:
          serializeLearner(
            updated.learner
          ),
        period:
          updated
            .assessmentSession
            ?.assessmentPeriod ||
          null,
      });
    } catch (error) {
      console.error(
        "learner_join error:",
        error
      );

      return responseJson(
        {
          error:
            "Unable to connect to the assessment.",
        },
        500
      );
    }
  }

  /* ======================================================================== */
  /* LEARNER HEARTBEAT                                                        */
  /* ======================================================================== */

  if (
    action ===
    "learner_heartbeat"
  ) {
    const code =
      normalizeCode(
        body?.code
      );

    if (!code) {
      return responseJson(
        {
          error:
            "Assessment code is required.",
        },
        400
      );
    }

    try {
      const host =
        await findHostByCode(
          code
        );

      if (!host) {
        return responseJson(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      if (host.ended) {
        return responseJson({
          status:
            host.stage ===
            "completed"
              ? "completed"
              : "ended",
          connected: false,
          completed:
            host.stage ===
            "completed",
          ended: true,
          stage:
            host.stage,
          current_content:
            host.currentContent,
          story_title:
            host.storyTitle,
        });
      }

      if (
        host.assessmentSession
          ?.isCompleted
      ) {
        return responseJson({
          status: "completed",
          connected: false,
          completed: true,
          ended:
            host.ended,
          updated_at:
            host.updatedAt,
          stage:
            host.stage,
          current_content:
            host.currentContent,
          story_title:
            host.storyTitle,
        });
      }

      if (!host.learnerId) {
        return responseJson(
          {
            error:
              "No learner is assigned to this assessment.",
          },
          409
        );
      }

      // Keep heartbeat read-only. Delayed/background browser heartbeats
      // must never reset the teacher view to "Waiting for learner".
      return responseJson({
        status: "ok",
        connected: true,
        completed: false,
        ended: false,
        stage: host.stage,
        current_content: host.currentContent,
        story_title: host.storyTitle,
        period: host.assessmentSession?.assessmentPeriod || null,
      });
    } catch (error) {
      console.error(
        "learner_heartbeat error:",
        error
      );

      return responseJson(
        {
          error:
            "Unable to maintain the assessment connection.",
        },
        500
      );
    }
  }

  /* ======================================================================== */
  /* LEARNER FINISH                                                           */
  /* ======================================================================== */

  if (
    action ===
    "learner_finish"
  ) {
    const code =
      normalizeCode(
        body?.code
      );

    if (!code) {
      return responseJson(
        {
          error:
            "Assessment code is required.",
        },
        400
      );
    }

    try {
      const host =
        await findHostByCode(
          code
        );

      if (!host) {
        return responseJson(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      if (
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "No assessment session is attached to this code.",
          },
          409
        );
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            const scoring =
              await calculateMetrics(
                tx,
                host.assessmentSessionId
              );

            const assessment =
              await tx.assessmentSession.update(
                {
                  where: {
                    id:
                      host.assessmentSessionId,
                  },
                  data: {
                    // Only explicit learner completion/finalization marks the
                    // BoSY/MoSY/EoSY assessment as completed.
                    isCompleted:
                      true,

                    overallClassification:
                      scoring.classification,
                  },
                }
              );

            await tx.hostSession.update(
              {
                where: {
                  id: host.id,
                },
                data: {
                  ended: true,
                  stage:
                    "completed",
                  currentContent:
                    "Assessment completed.",
                  linkedAt:
                    new Date(),
                },
              }
            );

            return {
              assessment,
              scoring,
            };
          }
        );

      return responseJson({
        status: "ok",
        completed: true,
        period:
          result
            .assessment
            .assessmentPeriod,
        classification:
          result.scoring
            .classification,
        scoring:
          result.scoring,
      });
    } catch (error) {
      console.error(
        "learner_finish error:",
        error
      );

      return responseJson(
        {
          error:
            "Unable to finish the assessment.",
        },
        500
      );
    }
  }

  /* ======================================================================== */
  /* LEARNER EXPERIENCE RATING                                               */
  /* ======================================================================== */

  if (action === "save_experience_rating") {
    const code = normalizeCode(body?.code);
    const rating = Number(body?.experience_rating ?? body?.experienceRating);
    const learnerId = Number(body?.learner_id ?? body?.learnerId ?? 0);
    const submittedComprehension = normalizeComprehensionSnapshot(
      body?.comprehension_results ?? body?.comprehensionResults
    );
    const submittedMiscues = normalizePassageMiscueSnapshot(
      body?.passage_miscues ?? body?.passageMiscues
    );
    const submittedTimerSeconds = Number(
      body?.timer_seconds ?? body?.timerSeconds
    );

    if (!code || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return responseJson({ error: "A valid assessment code and experience rating from 1 to 5 are required." }, 400);
    }
    if (
      !submittedComprehension ||
      submittedComprehension.length !== COMPREHENSION_QUESTION_COUNT
    ) {
      return responseJson({ error: "All six comprehension responses must be recorded before the learner experience rating." }, 409);
    }
    if (submittedMiscues === null) {
      return responseJson({ error: "The passage miscue record is invalid." }, 400);
    }
    if (
      !Number.isInteger(submittedTimerSeconds) ||
      submittedTimerSeconds < 0 ||
      submittedTimerSeconds > 120
    ) {
      return responseJson({ error: "The passage timer result is invalid." }, 400);
    }

    try {
      const ratingAuth = await requireTeacher(request);
      if (ratingAuth.error) return ratingAuth.error;

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          teacherId: ratingAuth.userId,
          ended: false,
        },
      });
      if (!host || host.ended || !host.assessmentSessionId) {
        return responseJson({ error: "Assessment session not found or already closed." }, 404);
      }
      if (learnerId && Number(host.learnerId) !== learnerId) {
        return responseJson({ error: "Learner does not match this assessment session." }, 403);
      }
      /*
       * The final answer and learner-experience prompt are optimistic, so the
       * host may still be on comprehension/passage when the rating arrives.
       * The submitted six-answer snapshot is authoritative in that race.
       */
      if (!["learner_experience", "comprehension", "passage"].includes(host.stage)) {
        throw new Error("The learner experience rating is not currently requested.");
      }

      const transactionOperations = [
        /*
         * Scope the delete to the submitted question indexes instead of
         * clearing the whole set. An answer the teacher recorded but that is
         * missing from this snapshot (a lagging write, a retried request, a
         * partial local journal) can then never be erased by this call.
         */
        prisma.comprehensionResult.deleteMany({
          where: {
            sessionId: host.assessmentSessionId,
            questionIndex: {
              in: submittedComprehension.map((result) => result.questionIndex),
            },
          },
        }),
        prisma.comprehensionResult.createMany({
          data: submittedComprehension.map((result) => ({
            sessionId: host.assessmentSessionId,
            ...result,
          })),
        }),
        prisma.passageMiscue.deleteMany({
          where: { sessionId: host.assessmentSessionId },
        }),
      ];
      if (submittedMiscues.length) {
        transactionOperations.push(
          prisma.passageMiscue.createMany({
            data: submittedMiscues.map((miscue) => ({
              sessionId: host.assessmentSessionId,
              ...miscue,
            })),
          })
        );
      }
      transactionOperations.push(
        prisma.sessionMetrics.upsert({
          where: { sessionId: host.assessmentSessionId },
          update: {
            timerSeconds: submittedTimerSeconds,
            experienceRating: rating,
          },
          create: {
            sessionId: host.assessmentSessionId,
            timerSeconds: submittedTimerSeconds,
            experienceRating: rating,
          },
        }),
        prisma.hostSession.updateMany({
          where: {
            id: host.id,
            ended: false,
            stage: { in: ["learner_experience", "comprehension", "passage"] },
          },
          data: { ended: false, stage: "teacher_review", currentContent: "TEACHER_REVIEW", linkedAt: host.linkedAt || new Date() },
        })
      );

      const transactionResults = await prisma.$transaction(transactionOperations);
      const transition = transactionResults[transactionResults.length - 1];
      if (transition.count !== 1) {
        throw new Error("The learner experience rating could not be saved because the assessment stage changed.");
      }

      const [scoring, updatedHost] = await Promise.all([
        safeCalculateMetrics(host.assessmentSessionId),
        prisma.hostSession.findUnique({ where: { id: host.id } }),
      ]);

      return responseJson({
        status: "ok",
        saved: true,
        experience_rating: rating,
        scoring,
        stage: updatedHost.stage,
        current_content: updatedHost.currentContent,
      });
    } catch (error) {
      console.error("save_experience_rating error:", error);
      const message = String(error?.message || "");
      const knownStateError = message.startsWith("The learner experience rating");
      return responseJson(
        { error: knownStateError ? message : "Unable to save the learner experience rating." },
        knownStateError ? 409 : 500
      );
    }
  }

  /* ======================================================================== */
  /* TEACHER AUTHENTICATION                                                   */
  /* ======================================================================== */

  const auth =
    await requireTeacher(
      request
    );

  if (auth.error) {
    return auth.error;
  }

  const {
    userId,
  } = auth;

  try {

    /* ====================================================================== */
    /* SAVE EARLY-TERMINATION OBSERVATION                                     */
    /* ====================================================================== */

    if (action === "save_termination_observation") {
      const code = normalizeCode(body?.code);
      const remarks = String(
        body?.remarks ?? ""
      ).trim();

      if (!code) {
        return responseJson(
          { error: "Assessment code is required." },
          400
        );
      }

      if (remarks.length > 5000) {
        return responseJson(
          { error: "Remarks must be 5,000 characters or fewer." },
          400
        );
      }

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          teacherId: userId,
        },
        include: {
          assessmentSession: true,
          learner: true,
        },
      });

      if (!host) {
        return responseJson(
          { error: "Assessment session not found." },
          404
        );
      }

      const needsManualObservation =
        (
          host.stage === "terminated" &&
          (
            host.currentContent === "ZERO_SCORE_PART1_TASK1" ||
            !host.currentContent
          )
        ) ||
        host.stage === "completed";

      if (!needsManualObservation || !host.assessmentSessionId) {
        return responseJson(
          {
            error:
              "This assessment is not awaiting its final teacher observation.",
          },
          409
        );
      }

      const classification =
        host.assessmentSession.overallClassification ||
        host.assessmentSession.sessionMetrics?.classificationLabel ||
        "Low Emerging Reader";

      const saved = await prisma.$transaction(async (tx) => {
        const metrics = await tx.sessionMetrics.upsert({
          where: {
            sessionId: host.assessmentSessionId,
          },
          update: {
            remarks,
            classificationLabel: classification,
          },
          create: {
            sessionId: host.assessmentSessionId,
            observationLevel: null,
            remarks,
            task1Score: 0,
            task2Score: 0,
            totalMiscues: 0,
            miscueAccuracy: 100,
            comprehensionScore: 0,
            classificationLabel: classification,
          },
        });

        const assessment = await tx.assessmentSession.update({
          where: {
            id: host.assessmentSessionId,
          },
          data: {
            isCompleted: true,
            overallClassification: classification,
          },
        });

        return { metrics, assessment };
      });

      return responseJson({
        status: "ok",
        saved: true,
        observation_level: null,
        remarks: saved.metrics.remarks || "",
        classification:
          saved.assessment.overallClassification ||
          saved.metrics.classificationLabel ||
          "Low Emerging Reader",
        assessment_completed:
          Boolean(saved.assessment.isCompleted),
      });
    }
    /* ====================================================================== */
    /* ADD LEARNER                                                             */
    /* ====================================================================== */

    if (
      action ===
      "add_learner"
    ) {
      const lrn =
        String(
          body?.lrn || ""
        ).trim();

      const lastName =
        String(
          body?.last_name || ""
        ).trim();

      const firstName =
        String(
          body?.first_name || ""
        ).trim();

      const middleName =
        String(
          body?.middle_name || ""
        ).trim();

      const sex =
        String(
          body?.sex || ""
        ).trim();

      if (
        !lrn ||
        !lastName ||
        !firstName ||
        !sex
      ) {
        return responseJson(
          {
            error:
              "LRN, last name, first name, and sex are required.",
          },
          400
        );
      }

      if (
        !/^\d{10,12}$/.test(
          lrn
        )
      ) {
        return responseJson(
          {
            error:
              "LRN must contain 10 to 12 digits.",
          },
          400
        );
      }

      const existing =
        await prisma.learner.findUnique(
          {
            where: {
              lrn,
            },
          }
        );

      if (existing) {
        return responseJson(
          {
            error:
              "A learner with this LRN already exists.",
          },
          409
        );
      }

      const teacher =
        await prisma.user.findUnique(
          {
            where: {
              id: userId,
            },
            select: {
              section:
                true,
            },
          }
        );

      const learner =
        await prisma.learner.create(
          {
            data: {
              lrn,
              firstName,
              lastName,
              middleName:
                middleName ||
                null,
              sex,
              gradeLevel: 3,
              section:
                teacher?.section ||
                null,
              teacherId:
                userId,
            },
          }
        );

      return responseJson({
        status: "ok",
        learner:
          serializeLearner(
            learner
          ),
      });
    }

    /* ====================================================================== */
    /* DELETE LEARNER                                                          */
    /* ====================================================================== */

    if (
      action ===
      "delete_learner"
    ) {
      const learnerId =
        Number(
          body?.learner_id
        );

      if (
        !Number.isInteger(
          learnerId
        )
      ) {
        return responseJson(
          {
            error:
              "Valid learner ID is required.",
          },
          400
        );
      }

      const learner =
        await prisma.learner.findFirst(
          {
            where: {
              id: learnerId,
              teacherId:
                userId,
            },
          }
        );

      if (!learner) {
        return responseJson(
          {
            error:
              "Learner not found.",
          },
          404
        );
      }

      await prisma.learner.delete(
        {
          where: {
            id: learnerId,
          },
        }
      );

      return responseJson({
        status: "ok",
      });
    }

    /* ====================================================================== */
    /* DELETE LEARNERS (BULK)                                                 */
    /* ====================================================================== */

    if (
      action ===
      "delete_learners"
    ) {
      const learnerIds =
        Array.isArray(
          body?.learner_ids
        )
          ? body.learner_ids
              .map((value) => Number(value))
              .filter(
                (value) =>
                  Number.isInteger(value) &&
                  value > 0
              )
          : [];

      const uniqueIds = [
        ...new Set(learnerIds),
      ];

      if (!uniqueIds.length) {
        return responseJson(
          {
            error:
              "At least one valid learner ID is required.",
          },
          400
        );
      }

      const ownedLearners =
        await prisma.learner.findMany({
          where: {
            id: {
              in: uniqueIds,
            },
            teacherId: userId,
          },
          select: {
            id: true,
          },
        });

      if (
        ownedLearners.length !==
        uniqueIds.length
      ) {
        return responseJson(
          {
            error:
              "One or more selected learners do not belong to your account.",
          },
          403
        );
      }

      await prisma.learner.deleteMany({
        where: {
          id: {
            in: uniqueIds,
          },
          teacherId: userId,
        },
      });

      return responseJson({
        status: "ok",
        deleted_learner_ids: uniqueIds,
        deleted_count: uniqueIds.length,
      });
    }

    /* ====================================================================== */
    /* HOST START                                                              */
    /* ====================================================================== */

    if (
      action ===
      "host_start"
    ) {
      const learnerId =
        Number(
          body?.learner_id ??
            body?.learnerId
        );

      const period =
        normalizePeriod(
          body?.period
        );

      if (
        !Number.isInteger(
          learnerId
        ) ||
        learnerId <= 0
      ) {
        return responseJson(
          {
            error:
              "A valid learner is required.",
          },
          400
        );
      }

      if (!period) {
        return responseJson(
          {
            error:
              "A valid assessment period is required.",
          },
          400
        );
      }

      const learner =
        await prisma.learner.findFirst(
          {
            where: {
              id: learnerId,
              teacherId:
                userId,
            },
          }
        );

      if (!learner) {
        return responseJson(
          {
            error:
              "Learner does not belong to this teacher.",
          },
          404
        );
      }

      const completedSessions =
        await prisma.assessmentSession.findMany(
          {
            where: {
              learnerId,
              teacherId:
                userId,
              isCompleted:
                true,
            },
            select: {
              assessmentPeriod:
                true,
            },
          }
        );

      const completedPeriods =
        new Set(
          completedSessions.map(
            (item) =>
              item.assessmentPeriod
          )
        );

      /*
       * Keep the school-year sequence logical.
       */
      if (
        period === "MoSY" &&
        !completedPeriods.has(
          "BoSY"
        )
      ) {
        return responseJson(
          {
            error:
              "BoSY must be completed before MoSY.",
          },
          400
        );
      }

      if (
        period === "EoSY" &&
        !completedPeriods.has(
          "BoSY"
        ) &&
        !completedPeriods.has(
          "MoSY"
        )
      ) {
        return responseJson(
          {
            error:
              "BoSY or MoSY must be completed before EoSY.",
          },
          400
        );
      }

      const alreadyCompleted =
        await prisma.assessmentSession.findFirst(
          {
            where: {
              learnerId,
              teacherId:
                userId,
              assessmentPeriod:
                period,
              isCompleted:
                true,
            },
          }
        );

      if (alreadyCompleted) {
        return responseJson(
          {
            error:
              `${period} has already been completed for this learner.`,
          },
          409
        );
      }

      const existingHost =
        await prisma.hostSession.findFirst(
          {
            where: {
              teacherId:
                userId,
              learnerId,
              ended: false,
            },
          }
        );

      if (existingHost) {
        if (existingHost.linkedAt) {
          return responseJson(
            {
              error:
                "An active assessment session is already in progress for this learner. End it before starting a new session.",
            },
            409
          );
        }

        return responseJson({
          status:
            "ok",
          existing:
            true,
          code:
            existingHost.code,
          host_session_id:
            existingHost.id,
          assessment_session_id:
            existingHost.assessmentSessionId,
          learner_id:
            existingHost.learnerId,
          period,
        });
      }

      const code =
        await generateUniqueCode();

      const assessment =
        await prisma.assessmentSession.create(
          {
            data: {
              learnerId,
              teacherId:
                userId,
              assessmentPeriod:
                period,
              dateAdministered:
                new Date(),
              isCompleted:
                false,
              overallClassification:
                null,
            },
          }
        );

      const host =
        await prisma.hostSession.create(
          {
            data: {
              code,
              teacherId:
                userId,
              learnerId,
              assessmentSessionId:
                assessment.id,
              stage:
                "waiting",
              currentContent:
                "Waiting for learner to connect...",
              storyTitle:
                null,
              ended: false,
              linkedAt:
                null,
            },
          }
        );

      return responseJson({
        status: "ok",
        existing: false,
        code,
        host_session_id:
          host.id,
        assessment_session_id:
          assessment.id,
        learner_id:
          learnerId,
        period,
      });
    }

    /* ====================================================================== */
    /* FAST HOST ADVANCE                                                       */
    /* ====================================================================== */

    if (action === "host_advance") {
      const code = normalizeCode(body?.code);
      if (!code) {
        return responseJson(
          { error: "Assessment code is required." },
          400
        );
      }

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          teacherId: userId,
          ended: false,
        },
      });

      if (!host) {
        return responseJson(
          { error: "Active assessment session not found." },
          404
        );
      }

      const requestedStage = String(body?.stage || "").trim();
      const requestedContent =
        body?.currentContent == null
          ? null
          : String(body.currentContent);
      const requestedTitle =
        body?.storyTitle == null
          ? null
          : String(body.storyTitle);

      if (!requestedStage || requestedContent == null) {
        return responseJson(
          { error: "Next assessment item is required." },
          400
        );
      }

      /*
       * This endpoint intentionally performs only the single lightweight
       * host-session update required for the learner's next item. Answer
       * persistence/scoring happens separately in the background queue.
       */
      const expectedStage = String(
        body?.expected_stage ??
          body?.expectedStage ??
          ""
      ).trim();

      const expectedContent =
        body?.expected_current_content ??
        body?.expectedCurrentContent ??
        null;

      /*
       * All modern host transitions are compare-and-set operations. Reject
       * legacy queued advances without an expected state so a stale IndexedDB
       * mutation from an older client can never rewind the assessment.
       */
      if (
        !expectedStage ||
        expectedContent === null
      ) {
        return responseJson({
          status: "ok",
          stale: true,
          session: {
            id: host.id,
            code: host.code,
            stage: host.stage,
            current_content:
              host.currentContent,
            story_title:
              host.storyTitle,
            learner_id:
              host.learnerId,
            ended:
              host.ended,
            connected:
              Boolean(
                host.learnerId &&
                host.linkedAt
              ),
            linked_at:
              host.linkedAt,
            updated_at:
              host.updatedAt,
            passage_started_at:
              host.passageStartedAt,
            passage_paused_at:
              host.passagePausedAt,
            passage_paused_seconds:
              host.passagePausedSeconds,
          },
        });
      }

      const updateWhere = {
        id: host.id,
        ended: false,
        ...(expectedStage
          ? { stage: expectedStage }
          : {}),
        ...(expectedContent !== null
          ? {
              /*
               * Tolerate the un-initialised join placeholder. A host parked on
               * "Waiting for learner to connect..." would otherwise fail this
               * guard on every single advance, silently stalling the whole
               * stage so the learner never received an item. A real letter or
               * word never starts with "Waiting", so this cannot mask a
               * genuine mismatch (including a stale queued rewind).
               */
              OR: [
                {
                  currentContent:
                    String(expectedContent),
                },
                {
                  currentContent: {
                    startsWith: "Waiting",
                  },
                },
              ],
            }
          : {}),
      };

      const updatedCount =
        await prisma.hostSession.updateMany({
          where: updateWhere,
          data: {
            stage: requestedStage,
            currentContent: requestedContent,
            storyTitle: requestedTitle,
          },
        });

      const updated =
        await prisma.hostSession.findUnique({
          where: { id: host.id },
        });

      if (
        updatedCount.count !== 1 ||
        !updated
      ) {
        return responseJson({
          status: "ok",
          stale: true,
          session: updated
            ? {
                id: updated.id,
                code: updated.code,
                stage: updated.stage,
                current_content:
                  updated.currentContent,
                story_title:
                  updated.storyTitle,
                learner_id:
                  updated.learnerId,
                ended:
                  updated.ended,
                connected:
                  Boolean(
                    updated.learnerId &&
                    updated.linkedAt
                  ),
                linked_at:
                  updated.linkedAt,
                updated_at:
                  updated.updatedAt,
                passage_started_at:
                  updated.passageStartedAt,
                passage_paused_at:
                  updated.passagePausedAt,
                passage_paused_seconds:
                  updated.passagePausedSeconds,
              }
            : null,
        });
      }

      return responseJson({
        status: "ok",
        session: {
          id: updated.id,
          code: updated.code,
          stage: updated.stage,
          current_content: updated.currentContent,
          story_title: updated.storyTitle,
          learner_id: updated.learnerId,
          ended: updated.ended,
          connected: Boolean(updated.learnerId && updated.linkedAt),
          linked_at: updated.linkedAt,
          updated_at: updated.updatedAt,
          passage_started_at: updated.passageStartedAt,
          passage_paused_at: updated.passagePausedAt,
          passage_paused_seconds: updated.passagePausedSeconds,
        },
      });
    }

    /* ====================================================================== */
    /* HOST UPDATE                                                             */
    /* ====================================================================== */

    if (
      action ===
      "host_update"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      if (!code) {
        return responseJson(
          {
            error:
              "Assessment code is required.",
          },
          400
        );
      }

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
          }
        );

      if (!host) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      const data = {};

      if (
        body?.stage !==
        undefined
      ) {
        data.stage =
          String(
            body.stage
          );
      }

      if (
        body?.currentContent !==
        undefined
      ) {
        data.currentContent =
          body.currentContent ===
          null
            ? null
            : String(
                body.currentContent
              );
      }

      if (
        body?.storyTitle !==
        undefined
      ) {
        data.storyTitle =
          body.storyTitle ===
          null
            ? null
            : String(
                body.storyTitle
              );
      }

      const updated =
        await prisma.hostSession.update(
          {
            where: {
              id: host.id,
            },
            data,
          }
        );

      return responseJson({
        status: "ok",
        session: {
          id: updated.id,
          code: updated.code,
          stage:
            updated.stage,
          current_content:
            updated.currentContent,
          story_title:
            updated.storyTitle,
          learner_id:
            updated.learnerId,
          ended:
            updated.ended,
        },
      });
    }

    /* ====================================================================== */
    /* HOST END                                                                */
    /* ====================================================================== */

    if (
      action ===
      "host_end"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      if (!code) {
        return responseJson(
          {
            error:
              "Assessment code is required.",
          },
          400
        );
      }

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
          }
        );

      if (!host) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      /*
       * End Session is a cancellation, not an assessment completion.
       * Remove the in-progress assessment record itself so it cannot appear
       * in Assessment Records, Class Summary, Class Record, or Excel exports.
       *
       * AssessmentSession owns all letter/word/passage/comprehension results
       * and metrics with ON DELETE CASCADE. HostSession keeps only the
       * connection shell; its assessmentSessionId is cleared explicitly.
       */
      await prisma.$transaction(
        async (tx) => {
          if (
            host.assessmentSessionId
          ) {
            await tx.assessmentSession.delete({
              where: {
                id:
                  host.assessmentSessionId,
              },
            });
          }

          await tx.hostSession.update({
            where: {
              id:
                host.id,
            },
            data: {
              ended:
                true,
              stage:
                "ended",
              currentContent:
                "Assessment session ended by teacher.",
              linkedAt:
                null,
              assessmentSessionId:
                null,
            },
          });
        }
      );

      const endedHost = await prisma.hostSession.findUnique({
        where: { id: host.id },
        select: {
          id: true,
          code: true,
          stage: true,
          currentContent: true,
          storyTitle: true,
          learnerId: true,
          ended: true,
          linkedAt: true,
          updatedAt: true,
        },
      });

      return responseJson({
        status: "ok",
        completed: false,
        reset: true,
        session: endedHost
          ? {
              id: endedHost.id,
              code: endedHost.code,
              stage: endedHost.stage,
              current_content: endedHost.currentContent,
              currentContent: endedHost.currentContent,
              story_title: endedHost.storyTitle,
              storyTitle: endedHost.storyTitle,
              learner_id: endedHost.learnerId,
              learnerId: endedHost.learnerId,
              ended: endedHost.ended,
              connected: false,
              linked_at: endedHost.linkedAt,
              updated_at: endedHost.updatedAt,
            }
          : null,
        message:
          "Teacher host session ended. The incomplete assessment was reset and was not marked completed.",
      });
    }

    /* ====================================================================== */
    /* RECORD LETTER                                                          */
    /* ====================================================================== */

    if (
      action ===
      "record_letter"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
          }
        );

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      const runtimeAssessmentContent = await getLiveAssessmentContent(
        host.teacherId,
        host.assessmentSession?.assessmentPeriod || "BoSY"
      );
      const runtimeLetters = runtimeAssessmentContent.letters;

      const letterIndex =
        Number(
          body?.letter_index ??
            body?.letterIndex
        );

      const isCorrect =
        Boolean(
          body?.is_correct ??
            body?.isCorrect
        );

      if (
        !Number.isInteger(
          letterIndex
        ) ||
        letterIndex < 0 ||
        letterIndex >=
          runtimeLetters.length
      ) {
        return responseJson(
          {
            error:
              "Invalid letter index.",
          },
          400
        );
      }

      const letter =
        runtimeLetters[
          letterIndex
        ];

      const existing =
        await prisma.letterTaskResult.findFirst(
          {
            where: {
              sessionId:
                host.assessmentSessionId,
              letterIndex,
            },
          }
        );

      let result;

      if (existing) {
        result =
          await prisma.letterTaskResult.update(
            {
              where: {
                id:
                  existing.id,
              },
              data: {
                letter,
                isCorrect,
              },
            }
          );
      } else {
        result =
          await prisma.letterTaskResult.create(
            {
              data: {
                sessionId:
                  host.assessmentSessionId,
                letterIndex,
                letter,
                isCorrect,
              },
            }
          );
      }

      /*
       * The first nine answers are saved in the background to keep the live
       * assessment responsive. On Letter 10, reconcile the teacher's full
       * local Task 1 snapshot before applying CRLA's official zero-score
       * stop rule, so a delayed background request can never turn a genuine
       * non-zero score into an early termination.
       *
       * This reconciliation must also run for a queued background replay
       * (persist_only), which is why the replay's early return now sits after
       * the snapshot repair instead of before it. A replayed Letter 10 still
       * carries the complete journal; skipping the repair left the Letter
       * Sounds rows behind that journal and made every later Part 1 total
       * (record_word scoring, host_get, the review overlay and the final
       * save) report fewer correct answers than the teacher recorded.
       */
      let task1SnapshotScore = null;
      if (
        letterIndex === runtimeLetters.length - 1 &&
        Array.isArray(body?.task1_results)
      ) {
        const submittedByIndex = new Map(
          body.task1_results.map((item) => [
            Number(item?.index),
            Boolean(item?.isCorrect),
          ])
        );
        const hasCompleteSnapshot =
          submittedByIndex.size === runtimeLetters.length &&
          runtimeLetters.every((_, index) => submittedByIndex.has(index));

        if (hasCompleteSnapshot) {
          task1SnapshotScore = Array.from(submittedByIndex.values()).filter(Boolean).length;
          await prisma.$transaction(async (tx) => {
            await tx.letterTaskResult.deleteMany({
              where: { sessionId: host.assessmentSessionId },
            });
            await tx.letterTaskResult.createMany({
              data: runtimeLetters.map((runtimeLetter, index) => ({
                letter: runtimeLetter,
                isCorrect: submittedByIndex.get(index),
                sessionId: host.assessmentSessionId,
                letterIndex: index,
              })),
            });
          });
        }
      }

      /*
       * Pure background replay of a single answer must not move the host
       * session. It has already repaired the full snapshot above when it was
       * the final letter, so the Part 1 rows are durable before this return.
       */
      if (body?.persist_only === true) {
        return responseJson({
          status: "ok",
          saved: true,
          result,
        });
      }

      let scoring = { hardTerminate: false, metricsPending: true };

      if (letterIndex === runtimeLetters.length - 1 && task1SnapshotScore === 0) {
        scoring = await safeCalculateMetrics(host.assessmentSessionId);

        if (scoring.hardTerminate) {
          await completeEarlyTermination(
            host.id,
            host.assessmentSessionId,
            scoring
          );
          const earlyStopHost = await prisma.hostSession.findUnique({
            where: { id: host.id },
          });

          return responseJson({
            status: "ok",
            result,
            completed: false,
            terminated: true,
            early_termination: "part1_task1_zero",
            scoring,
            session: earlyStopHost
              ? {
                  id: earlyStopHost.id,
                  code: earlyStopHost.code,
                  stage: earlyStopHost.stage,
                  current_content: earlyStopHost.currentContent,
                  story_title: earlyStopHost.storyTitle,
                  learner_id: earlyStopHost.learnerId,
                  ended: earlyStopHost.ended,
                  connected: Boolean(earlyStopHost.learnerId && earlyStopHost.linkedAt),
                  linked_at: earlyStopHost.linkedAt,
                  updated_at: earlyStopHost.updatedAt,
                }
              : null,
          });
        }
      }

      const nextIndex = letterIndex + 1;
      const nextHost = await prisma.hostSession.update({
        where: { id: host.id },
        data: {
          stage: nextIndex < runtimeLetters.length ? "letter" : "word",
          currentContent:
            nextIndex < runtimeLetters.length ? runtimeLetters[nextIndex] : (runtimeAssessmentContent.words[0] || WORDS[0]),
          storyTitle: "",
        },
      });

      return responseJson({
        status: "ok",
        result,
        completed: false,
        terminated: false,
        scoring,
        session: {
          id: nextHost.id,
          code: nextHost.code,
          stage: nextHost.stage,
          current_content: nextHost.currentContent,
          story_title: nextHost.storyTitle,
          learner_id: nextHost.learnerId,
          ended: nextHost.ended,
          connected: Boolean(nextHost.learnerId && nextHost.linkedAt),
          linked_at: nextHost.linkedAt,
          updated_at: nextHost.updatedAt,
          passage_started_at: nextHost.passageStartedAt,
          passage_paused_at: nextHost.passagePausedAt,
          passage_paused_seconds: nextHost.passagePausedSeconds,
        },
      });
    }

    /* ====================================================================== */
    /* RECORD WORD                                                             */
    /* ====================================================================== */

    if (
      action ===
      "record_word"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
          }
        );

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      const runtimeAssessmentContent = await getLiveAssessmentContent(
        host.teacherId,
        host.assessmentSession?.assessmentPeriod || "BoSY"
      );
      const runtimeWords = runtimeAssessmentContent.words;

      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );

      const isCorrect =
        Boolean(
          body?.is_correct ??
            body?.isCorrect
        );

      if (
        !Number.isInteger(
          wordIndex
        ) ||
        wordIndex < 0 ||
        wordIndex >=
          runtimeWords.length
      ) {
        return responseJson(
          {
            error:
              "Invalid word index.",
          },
          400
        );
      }

      const word =
        runtimeWords[wordIndex];

      const existing =
        await prisma.wordTaskResult.findFirst(
          {
            where: {
              sessionId:
                host.assessmentSessionId,
              wordIndex,
            },
          }
        );

      let result;

      if (existing) {
        result =
          await prisma.wordTaskResult.update(
            {
              where: {
                id:
                  existing.id,
              },
              data: {
                word,
                isCorrect,
              },
            }
          );
      } else {
        result =
          await prisma.wordTaskResult.create(
            {
              data: {
                sessionId:
                  host.assessmentSessionId,
                wordIndex,
                word,
                isCorrect,
              },
            }
          );
      }

      const isFinalWord =
        wordIndex === runtimeWords.length - 1;

      let hasCompleteTask2Snapshot = false;
      let task2SnapshotScore = null;
      if (isFinalWord && Array.isArray(body?.task2_results)) {
        const submittedByIndex = new Map(
          body.task2_results.map((item) => [
            Number(item?.index),
            Boolean(item?.isCorrect),
          ])
        );
        hasCompleteTask2Snapshot =
          submittedByIndex.size === runtimeWords.length &&
          runtimeWords.every((_, index) => submittedByIndex.has(index));

        if (hasCompleteTask2Snapshot) {
          task2SnapshotScore = Array.from(submittedByIndex.values()).filter(Boolean).length;
          await prisma.$transaction(async (tx) => {
            await tx.wordTaskResult.deleteMany({
              where: { sessionId: host.assessmentSessionId },
            });
            await tx.wordTaskResult.createMany({
              data: runtimeWords.map((runtimeWord, index) => ({
                sessionId: host.assessmentSessionId,
                wordIndex: index,
                word: runtimeWord,
                isCorrect: submittedByIndex.get(index),
              })),
            });
          });
        }
      }

      const submittedTask1ByIndex = new Map(
        Array.isArray(body?.task1_results)
          ? body.task1_results.map((item) => [
              Number(item?.index),
              Boolean(item?.isCorrect),
            ])
          : []
      );
      const hasCompleteTask1Snapshot =
        submittedTask1ByIndex.size === runtimeAssessmentContent.letters.length &&
        runtimeAssessmentContent.letters.every((_, index) =>
          submittedTask1ByIndex.has(index)
        );
      const task1SnapshotScore = hasCompleteTask1Snapshot
        ? Array.from(submittedTask1ByIndex.values()).filter(Boolean).length
        : null;

      /*
       * The Part 1 stop rule must be judged from the teacher's recorded
       * journal, never from Letter Sounds rows that a delayed background write
       * has not reached yet. record_letter repairs those rows on its own final
       * item; repeating the repair here (from the complete snapshot the final
       * word already carries) guarantees that the termination scoring, the
       * stored metrics, the Excel export and the review overlay all agree with
       * what the teacher actually recorded. Without it a lagging row set could
       * silently report a lower Part 1 total than the journal, which is how a
       * recorded 10 became a stored 6.
       */
      if (isFinalWord && hasCompleteTask1Snapshot) {
        await prisma.$transaction(async (tx) => {
          await tx.letterTaskResult.deleteMany({
            where: { sessionId: host.assessmentSessionId },
          });
          await tx.letterTaskResult.createMany({
            data: runtimeAssessmentContent.letters.map((runtimeLetter, index) => ({
              sessionId: host.assessmentSessionId,
              letterIndex: index,
              letter: runtimeLetter,
              isCorrect: submittedTask1ByIndex.get(index),
            })),
          });
        });
      }

      /*
       * Pure background replay of a single word answer must not move the host
       * session. The serialized host_advance is the single authoritative
       * advance for non-final words, mirroring how record_letter treats
       * persist_only replays. Without this, a delayed answer flush could race
       * the host advance and leave the learner stranded on the previous item.
       */
      if (body?.persist_only === true) {
        return responseJson({
          status: "ok",
          saved: true,
          result,
        });
      }

      let scoring = { hardTerminate: false, metricsPending: true };
      if (
        isFinalWord &&
        task1SnapshotScore !== null &&
        task2SnapshotScore !== null &&
        task1SnapshotScore + task2SnapshotScore <= 10
      ) {
        scoring = await safeCalculateMetrics(host.assessmentSessionId);
        if (scoring.hardTerminate) {
          await completeEarlyTermination(
            host.id,
            host.assessmentSessionId,
            scoring
          );
          const earlyStopHost = await prisma.hostSession.findUnique({
            where: { id: host.id },
          });

          return responseJson({
            status: "ok",
            result,
            completed: false,
            terminated: true,
            early_termination: "part1_total_low",
            scoring,
            session: earlyStopHost
              ? {
                  id: earlyStopHost.id,
                  code: earlyStopHost.code,
                  stage: earlyStopHost.stage,
                  current_content: earlyStopHost.currentContent,
                  story_title: earlyStopHost.storyTitle,
                  learner_id: earlyStopHost.learnerId,
                  ended: earlyStopHost.ended,
                  connected: Boolean(earlyStopHost.learnerId && earlyStopHost.linkedAt),
                  linked_at: earlyStopHost.linkedAt,
                  updated_at: earlyStopHost.updatedAt,
                }
              : null,
          });
        }
      }

      const wordExpectedWhere = isFinalWord
        ? {
            id: host.id,
            ended: false,
            stage: {
              in: hasCompleteTask2Snapshot
                ? ["letter", "word", "story_choice"]
                : ["word", "story_choice"],
            },
          }
        : {
            id: host.id,
            ended: false,
            stage: "word",
            currentContent: word,
          };

      const wordAdvanceCount =
        await prisma.hostSession.updateMany({
          where: wordExpectedWhere,
          data: {
            stage:
              isFinalWord
                ? "story_choice"
                : "word",
            currentContent:
              isFinalWord
                ? "Choose a story passage. The teacher will select it."
                : runtimeWords[wordIndex + 1],
            storyTitle:
              isFinalWord
                ? null
                : "",
          },
        });

      const nextHost =
        await prisma.hostSession.findUnique({
          where: {
            id: host.id,
          },
        });

      if (
        wordAdvanceCount.count !== 1 ||
        !nextHost
      ) {
        return responseJson({
          status: "ok",
          stale: true,
          result,
          completed: false,
          terminated: false,
          scoring,
          session: nextHost
            ? {
                id: nextHost.id,
                code: nextHost.code,
                stage: nextHost.stage,
                current_content:
                  nextHost.currentContent,
                story_title:
                  nextHost.storyTitle,
                learner_id:
                  nextHost.learnerId,
                ended:
                  nextHost.ended,
                connected:
                  Boolean(
                    nextHost.learnerId &&
                    nextHost.linkedAt
                  ),
                linked_at:
                  nextHost.linkedAt,
                updated_at:
                  nextHost.updatedAt,
              }
            : null,
        });
      }

      return responseJson({
        status: "ok",
        result,
        completed: false,
        terminated: false,
        scoring,
        session: {
          id: nextHost.id,
          code: nextHost.code,
          stage: nextHost.stage,
          current_content: nextHost.currentContent,
          story_title: nextHost.storyTitle,
          learner_id: nextHost.learnerId,
          ended: nextHost.ended,
          connected: Boolean(nextHost.learnerId && nextHost.linkedAt),
          linked_at: nextHost.linkedAt,
          updated_at: nextHost.updatedAt,
        },
      });
    }

    /* ====================================================================== */
    /* SELECT STORY / START PASSAGE                                           */
    /* ====================================================================== */

    if (action === "select_story") {
      const code = normalizeCode(body?.code);
      const storyId = Number(body?.story_id ?? body?.storyId);

      if (!code || !Number.isInteger(storyId)) {
        return responseJson(
          { error: "Assessment code and story are required." },
          400
        );
      }

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          teacherId: userId,
          ended: false,
        },
      });

      if (!host) {
        return responseJson(
          { error: "Active assessment session not found." },
          404
        );
      }

      if (host.stage !== "story_choice") {
        /*
         * Idempotent replay. A retried or double-tapped selection arrives after
         * the first request has already moved the host into the story. Failing
         * here surfaced "The assessment is not currently at story selection"
         * and stranded the teacher mid-assessment, so report the current state
         * as success once the story has actually started.
         */
        const storyAlreadyStarted = [
          "passage",
          "passage_paused",
          "comprehension",
          "learner_experience",
          "teacher_review",
          "completed",
        ].includes(String(host.stage || ""));

        if (storyAlreadyStarted) {
          return responseJson({
            status: "ok",
            already_selected: true,
            session: {
              id: host.id,
              code: host.code,
              stage: host.stage,
              current_content: host.currentContent,
              story_title: host.storyTitle,
              learner_id: host.learnerId,
              ended: host.ended,
              connected: Boolean(host.learnerId && host.linkedAt),
              linked_at: host.linkedAt,
              updated_at: host.updatedAt,
            },
          });
        }

        return responseJson(
          { error: "The assessment is not currently at story selection." },
          409
        );
      }

      const liveAssessmentContent = await getLiveAssessmentContent(
        host.teacherId,
        host.assessmentSession?.assessmentPeriod || "BoSY"
      );
      const stories = liveAssessmentContent.stories;
      const selected = stories.find((story) => Number(story.id) === storyId) || stories[storyId - 1];

      if (!selected) {
        return responseJson(
          { error: "That story passage is not available yet." },
          409
        );
      }

      const updated = await prisma.hostSession.update({
        where: { id: host.id },
        data: {
          stage: "passage",
          currentContent: selected.text,
          storyTitle: selected.title,
          passageStartedAt: null,
          passagePausedAt: null,
          passagePausedSeconds: 0,
        },
      });

      return responseJson({
        status: "ok",
        session: {
          id: updated.id,
          code: updated.code,
          stage: updated.stage,
          current_content: updated.currentContent,
          story_title: updated.storyTitle,
          learner_id: updated.learnerId,
          ended: updated.ended,
          connected: Boolean(updated.learnerId && updated.linkedAt),
          linked_at: updated.linkedAt,
          updated_at: updated.updatedAt,
        },
      });
    }

    /* ====================================================================== */
    /* PASSAGE READY / TIMER CONTROL                                          */
    /* ====================================================================== */

    if (action === "passage_ready") {
      const code = normalizeCode(body?.code);
      const timerAuth = await requireTeacher(request);

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          teacherId: timerAuth.userId,
          ended: false,
        },
      });

      if (!host) {
        return responseJson(
          { error: "Active assessment session not found." },
          404
        );
      }

      if (host.stage !== "passage") {
        const passageAlreadyCompleted =
          Boolean(host.passageStartedAt) &&
          [
            "comprehension",
            "learner_experience",
            "teacher_review",
            "completed",
          ].includes(host.stage);

        if (passageAlreadyCompleted) {
          return responseJson({
            status: "ok",
            stale: true,
            timer_started: true,
            passage_started_at: host.passageStartedAt,
            passage_paused_at: host.passagePausedAt,
            passage_paused_seconds: host.passagePausedSeconds,
            session: {
              id: host.id,
              code: host.code,
              stage: host.stage,
              current_content: host.currentContent,
              currentContent: host.currentContent,
              story_title: host.storyTitle,
              storyTitle: host.storyTitle,
              passage_started_at: host.passageStartedAt,
              passageStartedAt: host.passageStartedAt,
              passage_paused_at: host.passagePausedAt,
              passagePausedAt: host.passagePausedAt,
              passage_paused_seconds: host.passagePausedSeconds,
              passagePausedSeconds: host.passagePausedSeconds,
            },
          });
        }

        return responseJson(
          { error: "The story is still being prepared. Please wait a moment before starting the timer." },
          409
        );
      }

      const requestedStartedAt = new Date(body?.started_at ?? body?.startedAt ?? "");
      const requestReceivedAt = Date.now();
      const requestedStartedAtMs = requestedStartedAt.getTime();
      const synchronizedStartedAt =
        Number.isFinite(requestedStartedAtMs) &&
        requestedStartedAtMs <= requestReceivedAt &&
        requestReceivedAt - requestedStartedAtMs <= 10000
          ? requestedStartedAt
          : new Date(requestReceivedAt);

      const updated =
        host.passageStartedAt
          ? host
          : await prisma.hostSession.update({
              where: { id: host.id },
              data: {
                passageStartedAt: synchronizedStartedAt,
                passagePausedAt: null,
                passagePausedSeconds: 0,
              },
            });

      return responseJson({
        status: "ok",
        timer_started: Boolean(updated.passageStartedAt),
        passage_started_at: updated.passageStartedAt,
        passage_paused_at: updated.passagePausedAt,
        passage_paused_seconds: updated.passagePausedSeconds,
        session: {
          id: updated.id,
          code: updated.code,
          stage: updated.stage,
          current_content: updated.currentContent,
          currentContent: updated.currentContent,
          story_title: updated.storyTitle,
          storyTitle: updated.storyTitle,
          passage_started_at: updated.passageStartedAt,
          passageStartedAt: updated.passageStartedAt,
          passage_paused_at: updated.passagePausedAt,
          passagePausedAt: updated.passagePausedAt,
          passage_paused_seconds: updated.passagePausedSeconds,
          passagePausedSeconds: updated.passagePausedSeconds,
        },
      });
    }

    if (action === "passage_timer") {
      const code = normalizeCode(body?.code);
      const mode = String(body?.mode || "").toLowerCase();

      if (!code || !["pause", "resume"].includes(mode)) {
        return responseJson(
          { error: "A valid passage timer action is required." },
          400
        );
      }

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          teacherId: userId,
          ended: false,
          stage: "passage",
        },
      });

      if (!host || !host.passageStartedAt) {
        return responseJson(
          { error: "The passage timer has not started yet." },
          409
        );
      }

      if (mode === "pause") {
        if (host.passagePausedAt) {
          return responseJson({
            status: "ok",
            paused: true,
            passage_started_at: host.passageStartedAt,
            passage_paused_at: host.passagePausedAt,
            passage_paused_seconds: host.passagePausedSeconds,
          });
        }

        const updated = await prisma.hostSession.update({
          where: { id: host.id },
          data: {
            passagePausedAt: new Date(),
          },
        });

        return responseJson({
          status: "ok",
          paused: true,
          passage_started_at: updated.passageStartedAt,
          passage_paused_at: updated.passagePausedAt,
          passage_paused_seconds: updated.passagePausedSeconds,
        });
      }

      if (!host.passagePausedAt) {
        return responseJson({
          status: "ok",
          paused: false,
          passage_started_at: host.passageStartedAt,
          passage_paused_at: null,
          passage_paused_seconds: host.passagePausedSeconds,
        });
      }

      const pauseAdded = Math.max(
        0,
        Math.floor(
          (Date.now() - host.passagePausedAt.getTime()) / 1000
        )
      );

      const updated = await prisma.hostSession.update({
        where: { id: host.id },
        data: {
          passagePausedAt: null,
          passagePausedSeconds: host.passagePausedSeconds + pauseAdded,
        },
      });

      return responseJson({
        status: "ok",
        paused: false,
        passage_started_at: updated.passageStartedAt,
        passage_paused_at: null,
        passage_paused_seconds: updated.passagePausedSeconds,
      });
    }

    /* ====================================================================== */
    /* FINISH PASSAGE / START COMPREHENSION                                   */
    /* ====================================================================== */

    if (
      action ===
      "finish_passage"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      if (!code) {
        return responseJson(
          {
            error:
              "Assessment code is required.",
          },
          400
        );
      }

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
            include: {
              assessmentSession:
                true,
            },
          }
        );

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      if (
        host.stage !==
        "passage"
      ) {
        return responseJson(
          {
            error:
              "The assessment is not currently in the passage stage.",
          },
          409
        );
      }

      if (!host.passageStartedAt) {
        return responseJson(
          {
            error:
              "The passage timer has not started because the learner has not received the passage yet.",
          },
          409
        );
      }

      const pausedAt =
        host.passagePausedAt?.getTime() || null;

      const activePauseSeconds =
        pausedAt
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - pausedAt) / 1000
              )
            )
          : 0;

      const timerSeconds = Math.min(
        120,
        Math.max(
          0,
          Math.floor(
            (Date.now() -
              host.passageStartedAt.getTime()) /
              1000
          ) -
            Number(host.passagePausedSeconds || 0) -
            activePauseSeconds
        )
      );

      const requestedWordsRead =
        Math.min(
          100,
          Math.max(
            0,
            Number(
              body?.words_read ??
                body?.wordsRead ??
                100
            )
          )
        );

      /*
       * Finishing before the two-minute limit means the learner completed
       * the passage. The final word is therefore always word 100.
       * Only the time-limit path may use a teacher-selected last word.
       */
      const wordsReadByLearner =
        timerSeconds < 120
          ? 100
          : requestedWordsRead;

      if (
        !Number.isInteger(
          timerSeconds
        ) ||
        !Number.isInteger(
          wordsReadByLearner
        )
      ) {
        return responseJson(
          {
            error:
              "Timer and words-read values must be whole numbers.",
          },
          400
        );
      }

      const submittedMiscues = normalizePassageMiscueSnapshot(
        body?.passage_miscues ?? body?.passageMiscues
      );
      if (
        (body?.passage_miscues !== undefined || body?.passageMiscues !== undefined) &&
        submittedMiscues === null
      ) {
        return responseJson({ error: "The passage miscue record is invalid." }, 400);
      }

      try {
        const updatedHost =
          await prisma.$transaction(
            async (tx) => {
              if (submittedMiscues !== null) {
                await replacePassageMiscues(
                  tx,
                  host.assessmentSessionId,
                  submittedMiscues
                );
              }

              /*
               * Every word after the last word reached by the learner is
               * automatically recorded as an omission, matching the
               * documentation's two-minute scoring rule.
               */
              const existingOmissions =
                await tx.passageMiscue.findMany(
                  {
                    where: {
                      sessionId:
                        host.assessmentSessionId,
                      miscueType:
                        "Omission",
                      wordIndex: {
                        gte:
                          wordsReadByLearner,
                      },
                    },
                    select: {
                      wordIndex:
                        true,
                    },
                  }
                );

              const existingSet =
                new Set(
                  existingOmissions.map(
                    (item) =>
                      item.wordIndex
                  )
                );

              const omittedRows = [];

              for (
                let index =
                  wordsReadByLearner;
                index <
                100;
                index +=
                  1
              ) {
                if (
                  !existingSet.has(
                    index
                  )
                ) {
                  omittedRows.push(
                    {
                      sessionId:
                        host.assessmentSessionId,
                      wordIndex:
                        index,
                      miscueType:
                        "Omission",
                      misreadWord:
                        null,
                    }
                  );
                }
              }

              if (
                omittedRows.length
              ) {
                await tx.passageMiscue.createMany(
                  {
                    data:
                      omittedRows,
                  }
                );
              }

              await tx.sessionMetrics.upsert(
                {
                  where: {
                    sessionId:
                      host.assessmentSessionId,
                  },
                  update: {
                    timerSeconds,
                  },
                  create: {
                    sessionId:
                      host.assessmentSessionId,
                    timerSeconds,
                  },
                }
              );

              return tx.hostSession.update(
                {
                  where: {
                    id: host.id,
                  },
                  data: {
                    stage:
                      "comprehension",
                    currentContent:
                      String(host.storyTitle || "")
                        .trim()
                        .toLowerCase()
                        .includes("a day in the fields")
                        ? "What is the job of Dulnuwan?"
                        : "What must Para look for?",
                    storyTitle:
                      host.storyTitle || "Para the Parrot",
                  },
                }
              );
            },
            { timeout: 15000 }
          );

        /*
         * Calculate metrics after the transaction commits. The interactive
         * transaction now only writes miscues, the timer and the stage change,
         * so it cannot exceed the connection timeout on a slow database;
         * scoring runs on a fresh connection and is safe to retry.
         */
        const scoring =
          await safeCalculateMetrics(
            host.assessmentSessionId
          );

        return responseJson(
          {
            status:
              "ok",
            stage:
              "comprehension",
            current_content:
              updatedHost.currentContent,
            story_title:
              updatedHost.storyTitle,
            scoring,
          }
        );
      } catch (passageError) {
        console.error(
          "finish_passage error:",
          passageError
        );

        return responseJson(
          {
            error:
              "Unable to finish the passage stage.",
          },
          500
        );
      }
    }

    /* ====================================================================== */
    /* REMOVE PASSAGE MISCUE                                                   */
    /* ====================================================================== */

    if (
      action ===
      "remove_passage_miscue"
    ) {
      const code =
        normalizeCode(body?.code);

      const host =
        await prisma.hostSession.findFirst({
          where: {
            code,
            teacherId:
              userId,
            ended: false,
            stage: "passage",
          },
        });

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Active passage assessment session not found.",
          },
          404
        );
      }

      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );

      if (
        !Number.isInteger(wordIndex) ||
        wordIndex < 0 ||
        wordIndex >= 100
      ) {
        return responseJson(
          {
            error:
              "Invalid passage word index.",
          },
          400
        );
      }

      await prisma.passageMiscue.deleteMany({
        where: {
          sessionId:
            host.assessmentSessionId,
          wordIndex,
        },
      });

      const scoring =
        await safeCalculateMetrics(
          host.assessmentSessionId
        );

      return responseJson({
        status:
          "ok",
        saved:
          true,
        removed:
          true,
        wordIndex,
        scoring,
      });
    }

    /* ====================================================================== */
    /* RECORD PASSAGE MISCUE                                                   */
    /* ====================================================================== */

    if (
      action ===
      "record_passage_miscue"
    ) {
      const code =
        normalizeCode(body?.code);

      const host =
        await prisma.hostSession.findFirst({
          where: {
            code,
            teacherId: userId,
            ended: false,
            stage: "passage",
          },
        });

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          { error: "Active passage assessment session not found." },
          404
        );
      }

      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );

      const miscueType =
        String(
          body?.miscue_type ??
            body?.miscueType ??
            ""
        ).trim();

      const misreadWord =
        String(
          body?.misread_word ??
            body?.misreadWord ??
            ""
        ).trim();

      if (
        !Number.isInteger(wordIndex) ||
        wordIndex < 0 ||
        wordIndex >= 100
      ) {
        return responseJson(
          { error: "Invalid passage word index." },
          400
        );
      }

      if (!PASSAGE_MISCUE_TYPES.has(miscueType)) {
        return responseJson(
          { error: "Invalid miscue type." },
          400
        );
      }

      const existing =
        await prisma.passageMiscue.findFirst({
          where: {
            sessionId:
              host.assessmentSessionId,
            wordIndex,
          },
          orderBy: {
            recordedAt:
              "desc",
          },
        });

      const result =
        existing
          ? await prisma.passageMiscue.update({
              where: { id: existing.id },
              data: {
                miscueType,
                misreadWord:
                  misreadWord || null,
              },
            })
          : await prisma.passageMiscue.create({
              data: {
                sessionId:
                  host.assessmentSessionId,
                wordIndex,
                miscueType,
                misreadWord:
                  misreadWord || null,
              },
            });

      const scoring =
        await safeCalculateMetrics(
          host.assessmentSessionId
        );

      return responseJson({
        status: "ok",
        saved: true,
        result: {
          wordIndex: result.wordIndex,
          miscueType: result.miscueType,
          misreadWord:
            result.misreadWord || "",
        },
        scoring,
      });
    }

    /* ====================================================================== */
    /* RECORD COMPREHENSION                                                    */
    /* ====================================================================== */

    if (
      action ===
      "record_comprehension"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
          }
        );

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      const questionIndex =
        Number(
          body?.question_index ??
            body?.questionIndex
        );

      const isCorrect =
        Boolean(
          body?.is_correct ??
            body?.isCorrect
        );

      if (
        !Number.isInteger(
          questionIndex
        ) ||
        questionIndex < 0 ||
        questionIndex >= COMPREHENSION_QUESTION_COUNT
      ) {
        return responseJson(
          {
            error:
              "Invalid comprehension question index.",
          },
          400
        );
      }

      const existing =
        await prisma.comprehensionResult.findFirst(
          {
            where: {
              sessionId:
                host.assessmentSessionId,
              questionIndex,
            },
          }
        );

      let result;

      if (existing) {
        result =
          await prisma.comprehensionResult.update(
            {
              where: {
                id:
                  existing.id,
              },
              data: {
                isCorrect,
              },
            }
          );
      } else {
        result =
          await prisma.comprehensionResult.create(
            {
              data: {
                sessionId:
                  host.assessmentSessionId,
                questionIndex,
                isCorrect,
              },
            }
          );
      }

      const scoring =
        await safeCalculateMetrics(
          host.assessmentSessionId
        );

      return responseJson({
        status: "ok",
        result,
        scoring,
      });
    }

    /* ====================================================================== */
    /* SAVE FINAL ASSESSMENT REVIEW                                            */
    /* ====================================================================== */

    if (action === "save_final_assessment_review") {
      const code = normalizeCode(body?.code);
      const rawObservationLevel = body?.observation_level ?? body?.observationLevel;
      const observationLevel = Number(rawObservationLevel) || null;
      const remarks = String(body?.remarks ?? "").trim();

      if (!code) return responseJson({ error: "Assessment code is required." }, 400);
      if (remarks.length > 5000) return responseJson({ error: "Remarks must be 5,000 characters or fewer." }, 400);

      const host = await prisma.hostSession.findFirst({
        where: { code, teacherId: userId },
        include: {
          assessmentSession: {
            include: {
              sessionMetrics: true,
              letterResults: true,
              wordResults: true,
            },
          },
        },
      });

      if (!host || !host.assessmentSessionId || !host.assessmentSession) {
        return responseJson({ error: "Assessment session not found." }, 404);
      }
      const reviewAssessmentContent = await getLiveAssessmentContent(
        host.teacherId,
        host.assessmentSession.assessmentPeriod || "BoSY"
      );
      const reviewLetters = reviewAssessmentContent.letters;
      const reviewWords = reviewAssessmentContent.words;
      const submittedTask1Results = Array.isArray(body?.task1_results)
        ? body.task1_results
        : [];
      const submittedTask1ByIndex = new Map(
        submittedTask1Results.map((result) => [
          Number(result?.index),
          Boolean(result?.isCorrect),
        ])
      );
      const submittedTask2Results = Array.isArray(body?.task2_results)
        ? body.task2_results
        : [];
      const submittedTask2ByIndex = new Map(
        submittedTask2Results.map((result) => [
          Number(result?.index),
          Boolean(result?.isCorrect),
        ])
      );
      const hasSubmittedTask1Snapshot =
        submittedTask1ByIndex.size === reviewLetters.length &&
        reviewLetters.every((_, index) => submittedTask1ByIndex.has(index));
      const hasSubmittedTask2Snapshot =
        submittedTask2ByIndex.size === reviewWords.length &&
        reviewWords.every((_, index) => submittedTask2ByIndex.has(index));
      const hasSubmittedPart1Complete =
        hasSubmittedTask1Snapshot &&
        hasSubmittedTask2Snapshot;
      /*
       * Every stop rule below is derived from the submitted Part 1 journal,
       * which is the teacher-recorded source of truth that this action
       * rewrites transactionally. The client's termination flags are accepted
       * as an additional signal, but a complete journal must never be rejected
       * because a flag was missing, stale or lost with a retried request, and
       * an all-incorrect Letter Sounds journal is a zero-score stop by
       * definition even when that flag is absent.
       */
      const hasSubmittedZeroSnapshot =
        reviewLetters.length > 0 &&
        submittedTask1ByIndex.size === reviewLetters.length &&
        reviewLetters.every(
          (_, index) =>
            submittedTask1ByIndex.has(index) &&
            submittedTask1ByIndex.get(index) === false
        );
      const submittedPart1Total =
        Array.from(submittedTask1ByIndex.values()).filter(Boolean).length +
        Array.from(submittedTask2ByIndex.values()).filter(Boolean).length;
      const hasSubmittedPart1StopSnapshot =
        hasSubmittedPart1Complete &&
        submittedPart1Total <= 10;
      const isZeroScoreTermination =
        body?.zero_score_termination === true ||
        hasSubmittedZeroSnapshot ||
        host.currentContent === "ZERO_SCORE_PART1_TASK1";
      const isTask2Part1Termination =
        !isZeroScoreTermination &&
        (
          body?.part1_stop_termination === true ||
          hasSubmittedPart1StopSnapshot ||
          host.currentContent === "PART1_TOTAL_LOW"
        );

      // Never complete a Part 1 assessment from a partial browser or cloud
      // snapshot. The submitted journal is the full teacher-recorded source
      // of truth and is rewritten transactionally below, so Assessment
      // Records cannot legitimately contain "Not recorded" items.
      if (
        isZeroScoreTermination &&
        !hasSubmittedZeroSnapshot
      ) {
        return responseJson(
          { error: "All ten Letter Sounds responses are required before saving." },
          409
        );
      }
      if (
        isTask2Part1Termination &&
        !hasSubmittedPart1StopSnapshot
      ) {
        return responseJson(
          { error: "All Letter Sounds and Word Recognition responses are required before saving." },
          409
        );
      }
      const isPart1Termination =
        host.stage === "terminated" ||
        hasSubmittedZeroSnapshot ||
        hasSubmittedPart1StopSnapshot ||
        (
          host.assessmentSession.letterResults.length >= reviewLetters.length &&
          host.assessmentSession.letterResults.every((result) => !result.isCorrect)
        );
      const submittedMiscues = normalizePassageMiscueSnapshot(
        body?.passage_miscues ?? body?.passageMiscues
      );
      const submittedComprehension = normalizeComprehensionSnapshot(
        body?.comprehension_results ?? body?.comprehensionResults
      );
      const submittedTimerSeconds = Number(
        body?.timer_seconds ?? body?.timerSeconds
      );
      if (!isPart1Termination && !["teacher_review", "learner_experience", "completed"].includes(host.stage)) {
        return responseJson({ error: "The assessment is not ready for final review." }, 409);
      }
      if (!isPart1Termination && !host.assessmentSession.sessionMetrics?.experienceRating) {
        return responseJson({ error: "The learner experience rating must be completed before saving the assessment." }, 409);
      }
      if (
        !isPart1Termination &&
        (!hasSubmittedTask1Snapshot || !hasSubmittedTask2Snapshot)
      ) {
        return responseJson({ error: "The complete Part 1 result is required." }, 409);
      }
      if (!isPart1Termination && ![1, 2, 3, 4].includes(observationLevel)) return responseJson({ error: "Observation Level must be 1, 2, 3, or 4." }, 400);
      if (!isPart1Termination && submittedMiscues === null) return responseJson({ error: "The passage miscue record is invalid." }, 400);
      if (
        !isPart1Termination &&
        (!submittedComprehension || submittedComprehension.length !== COMPREHENSION_QUESTION_COUNT)
      ) {
        return responseJson({ error: "All six comprehension responses are required." }, 409);
      }
      if (
        !isPart1Termination &&
        (!Number.isInteger(submittedTimerSeconds) || submittedTimerSeconds < 0 || submittedTimerSeconds > 120)
      ) {
        return responseJson({ error: "The passage timer result is invalid." }, 400);
      }

      try {
        const saved = await prisma.$transaction(async (tx) => {
          if (hasSubmittedTask1Snapshot) {
            await tx.letterTaskResult.deleteMany({
              where: { sessionId: host.assessmentSessionId },
            });
            await tx.letterTaskResult.createMany({
              data: reviewLetters.map((letter, index) => ({
                sessionId: host.assessmentSessionId,
                letterIndex: index,
                letter,
                isCorrect: submittedTask1ByIndex.get(index),
              })),
            });
          }
          if (hasSubmittedTask2Snapshot) {
            await tx.wordTaskResult.deleteMany({
              where: { sessionId: host.assessmentSessionId },
            });
            await tx.wordTaskResult.createMany({
              data: reviewWords.map((word, index) => ({
                sessionId: host.assessmentSessionId,
                wordIndex: index,
                word,
                isCorrect: submittedTask2ByIndex.get(index),
              })),
            });
          }
          if (!isPart1Termination) {
            await replacePassageMiscues(
              tx,
              host.assessmentSessionId,
              submittedMiscues
            );
            await replaceComprehensionResults(
              tx,
              host.assessmentSessionId,
              submittedComprehension
            );
            await tx.sessionMetrics.upsert({
              where: { sessionId: host.assessmentSessionId },
              update: { timerSeconds: submittedTimerSeconds },
              create: {
                sessionId: host.assessmentSessionId,
                timerSeconds: submittedTimerSeconds,
              },
            });
          }
          const scoring = await calculateMetrics(tx, host.assessmentSessionId);
          const readingProfile = calculateClassification(
            scoring.task1Score,
            scoring.task2Score,
            scoring.task1Complete,
            scoring.task2Complete,
            scoring.miscueAccuracy,
            scoring.comprehensionScore,
            scoring.passageStarted
          );
          const metrics = await tx.sessionMetrics.upsert({
            where: { sessionId: host.assessmentSessionId },
            update: {
              task1Score: scoring.task1Score ?? 0,
              task2Score: scoring.task2Score ?? 0,
              totalMiscues: scoring.totalMiscues ?? 0,
              miscueAccuracy: scoring.misceAccuracy ?? scoring.miscueAccuracy ?? 0,
              comprehensionScore: scoring.comprehensionScore ?? 0,
              timerSeconds: scoring.metrics?.timerSeconds ?? scoring.timerSeconds ?? null,
              classificationLabel: readingProfile,
              observationLevel: isPart1Termination ? null : observationLevel,
              remarks: remarks || null,
              experienceRating: host.assessmentSession.sessionMetrics?.experienceRating ?? null,
            },
            create: {
              sessionId: host.assessmentSessionId,
              task1Score: scoring.task1Score ?? 0,
              task2Score: scoring.task2Score ?? 0,
              totalMiscues: scoring.totalMiscues ?? 0,
              miscueAccuracy: scoring.miscueAccuracy ?? 0,
              comprehensionScore: scoring.comprehensionScore ?? 0,
              timerSeconds: scoring.metrics?.timerSeconds ?? null,
              classificationLabel: readingProfile,
              observationLevel: isPart1Termination ? null : observationLevel,
              remarks: remarks || null,
              experienceRating: host.assessmentSession.sessionMetrics?.experienceRating ?? null,
            },
          });

          const assessment = await tx.assessmentSession.update({
            where: { id: host.assessmentSessionId },
            data: { isCompleted: true, overallClassification: readingProfile },
          });

          await tx.hostSession.update({
            where: { id: host.id },
            data: { ended: true, stage: "completed", currentContent: "Assessment completed.", linkedAt: new Date() },
          });

          return { metrics, assessment, scoring, readingProfile };
        }, {
          /*
           * The final review rewrites both Part 1 journals and recomputes the
           * rows inside one interactive transaction. Prisma's default 5s
           * budget can expire on the shared Supabase pooler mid-save and abort
           * an otherwise valid assessment, which surfaced to the teacher as
           * "Unable to save the final assessment review." Give the same work a
           * realistic budget instead of dropping the assessment.
           */
          maxWait: 10000,
          timeout: 20000,
        });

        return responseJson({
          status: "ok",
          saved: true,
          completed: true,
          classification: saved.readingProfile,
          experienceRating: saved.metrics.experienceRating,
          metrics: {
            ...(saved.scoring || {}),
            observationLevel: saved.metrics.observationLevel,
            remarks: saved.metrics.remarks || "",
            classification: saved.assessment.overallClassification,
            experienceRating: saved.metrics.experienceRating,
          },
        });
      } catch (error) {
        console.error("save_final_assessment_review error:", error);
        return responseJson({ error: "Unable to save the final assessment review." }, 500);
      }
    }

    /* ====================================================================== */
    /* FINALIZE                                                                */
    /* ====================================================================== */

    if (
      action ===
      "finalize"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                userId,
              ended: false,
            },
          }
        );

      if (
        !host ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            const scoring =
              await calculateMetrics(
                tx,
                host.assessmentSessionId
              );

            const assessment =
              await tx.assessmentSession.update(
                {
                  where: {
                    id:
                      host.assessmentSessionId,
                  },
                  data: {
                    // Only explicit learner completion/finalization marks the
                    // BoSY/MoSY/EoSY assessment as completed.
                    isCompleted:
                      true,
                    overallClassification:
                      scoring.classification,
                  },
                }
              );

            await tx.hostSession.update(
              {
                where: {
                  id: host.id,
                },
                data: {
                  ended: true,
                  stage:
                    "completed",
                  currentContent:
                    "Assessment completed.",
                },
              }
            );

            return {
              assessment,
              scoring,
            };
          }
        );

      return responseJson({
        status: "ok",
        completed: true,
        period:
          result.assessment
            .assessmentPeriod,
        classification:
          result.scoring
            .classification,
        scoring:
          result.scoring,
      });
    }

    return responseJson(
      {
        error:
          `Unknown assessment action: ${action}`,
      },
      400
    );
  } catch (error) {
    console.error(
      "Assessment POST error:",
      error
    );

    return responseJson(
      {
        error:
          "Internal assessment server error.",
      },
      500
    );
  }
}
