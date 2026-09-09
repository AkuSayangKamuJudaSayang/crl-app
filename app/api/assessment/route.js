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
        true,
      hardTerminateStage:
        "word",
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
   * 76-100% + 5-6           -> Reading at Grade Level
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
      : "Reading at Grade Level";
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
  const part1 =
    calculatePart1Profile(
      task1Score,
      task2Score,
      task1Complete,
      task2Complete
    );

  if (
    part1.hardTerminate
  ) {
    return part1.profile;
  }

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
    return await prisma.$transaction(
      (tx) => calculateMetrics(tx, assessmentSessionId)
    );
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
   * A Task 1 score of 0 is an official early-stop condition.
   * Part 2 was not administered, so its passage metrics must not be
   * manufactured from the 100-word denominator or empty response tables.
   */
  const isPart1Task1EarlyStop =
    part1.hardTerminateStage ===
      "letter";

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
    isPart1Task1EarlyStop
      ? null
      : existingSessionMetrics?.timerSeconds ??
        null;

  const wordsRead =
    isPart1Task1EarlyStop
      ? 0
      : Math.max(
          0,
          passageWordCount -
            totalMiscues
        );

  const miscueAccuracy =
    isPart1Task1EarlyStop
      ? 0
      : Number(
          wordsRead.toFixed(2)
        );

  const passageStarted =
    !isPart1Task1EarlyStop &&
    (
      miscues.length > 0 ||
      comprehension.length > 0 ||
      timerSeconds !== null
    );

  const wpm =
    isPart1Task1EarlyStop
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
                true,
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
            ended: true,
            stage:
              "terminated",
            currentContent:
              "ZERO_SCORE_PART1_TASK1",

            linkedAt: null,
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
            linkedAt: true,
            ended: true,
            stage: true,
            currentContent: true,
            storyTitle: true,
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
                    wpm: true,
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
            ? "part1_task1_zero"
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
                session
                  .sessionMetrics
                  ? Number(
                      session
                        .sessionMetrics
                        .miscueAccuracy
                    )
                  : null,

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
                session
                  .sessionMetrics
                  ?.totalMiscues !==
                  null &&
                session
                  .sessionMetrics
                  ?.totalMiscues !==
                  undefined
                  ? Math.max(
                      0,
                      100 -
                        Number(
                          session
                            .sessionMetrics
                            .totalMiscues
                        )
                    )
                  : null,

              wpm:
                session
                  .sessionMetrics
                  ?.timerSeconds &&
                Number(
                  session
                    .sessionMetrics
                    .timerSeconds
                ) > 0
                  ? Number(
                      (
                        (Math.max(
                          0,
                          100 -
                            Number(
                              session
                                .sessionMetrics
                                .totalMiscues ||
                                0
                            )
                        ) /
                          Number(
                            session
                              .sessionMetrics
                              .timerSeconds
                          )) *
                        60
                      ).toFixed(2)
                    )
                  : null,

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
              ? "part1_task1_zero"
              : null,
          passage_started_at:
            host.passageStartedAt,
          passage_paused_at:
            host.passagePausedAt,
          passage_paused_seconds:
            host.passagePausedSeconds,
          story_choices: STORY_CHOICES,
          learner:
            serializeLearner(
              host.learner
            ),
          metrics:
            host
              .assessmentSession
              ?.sessionMetrics
              ? {
                  task1Score:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .task1Score,

                  task2Score:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .task2Score,

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
                    host
                      .assessmentSession
                      .sessionMetrics
                      .timerSeconds
                      ? Number(
                          (
                            (
                              Math.max(
                                0,
                                getPassageWordCount() -
                                  host
                                    .assessmentSession
                                    .sessionMetrics
                                    .totalMiscues
                              ) /
                              host
                                .assessmentSession
                                .sessionMetrics
                                .timerSeconds
                            ) * 60
                          ).toFixed(2)
                        )
                      : null,

                  readingAccuracy:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .miscueAccuracy,

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

                  passageMiscues:
                    host
                      .assessmentSession
                      .passageMiscues
                      ?.map((miscue) => ({
                        wordIndex: miscue.wordIndex,
                        miscueType: miscue.miscueType,
                        misreadWord:
                          miscue.misreadWord || "",
                      })) || [],
                }
              : {
                  passageMiscues: [],
                },
        },
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

      const updateWhere = {
        id: host.id,
        ended: false,
        ...(expectedStage
          ? { stage: expectedStage }
          : {}),
        ...(expectedContent !== null
          ? {
              currentContent:
                String(expectedContent),
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

      return responseJson({
        status:
          "ok",
        completed:
          false,
        reset:
          true,
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
          LETTERS.length
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
        LETTERS[
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

      if (body?.persist_only === true) {
        return responseJson({
          status: "ok",
          saved: true,
          result,
        });
      }

      let scoring = { hardTerminate: false, metricsPending: true };

      if (letterIndex === LETTERS.length - 1) {
        scoring = await safeCalculateMetrics(host.assessmentSessionId);

        /*
         * Task 1 = 0 is a mandatory CRLA early-stop. Do not allow a
         * transient metrics persistence failure to fall through to the
         * normal "advance to word recognition" path.
         */
        const task1Zero =
          Number(scoring?.task1Score ?? 0) === 0 &&
          Number(scoring?.task2Score ?? 0) === 0;

        if (task1Zero) {
          scoring = {
            ...scoring,
            task1Score: 0,
            task2Score: 0,
            totalPart1Score: 0,
            part1ReadingLevel: "Full Refresher",
            part1Profile: "Low Emerging Reader",
            part1Refresher: "Full Refresher",
            hardTerminate: true,
            hardTerminateStage: "letter",
            classification: "Low Emerging Reader",
            wordsRead: 0,
            miscueAccuracy: 0,
            comprehensionScore: 0,
          };

          /*
           * Persist the terminal state even when calculateMetrics had a
           * recoverable metrics error. The learner must never advance to
           * Task 2 after a zero Task 1.
           */
          await completeEarlyTermination(
            host.id,
            host.assessmentSessionId,
            scoring
          );

          return responseJson({
            status: "ok",
            result,
            completed: false,
            terminated: true,
            early_termination: "part1_task1_zero",
            current_content: "ZERO_SCORE_PART1_TASK1",
            scoring,
            session: {
              id: host.id,
              code: host.code,
              stage: "terminated",
              current_content:
                "ZERO_SCORE_PART1_TASK1",
              currentContent:
                "ZERO_SCORE_PART1_TASK1",
              story_title: "",
              storyTitle: "",
              learner_id: host.learnerId,
              learnerId: host.learnerId,
              ended: true,
              connected: false,
              linked_at: host.linkedAt,
              linkedAt: host.linkedAt,
              updated_at: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }

      const nextIndex = letterIndex + 1;
      const nextHost = await prisma.hostSession.update({
        where: { id: host.id },
        data: {
          stage: nextIndex < LETTERS.length ? "letter" : "word",
          currentContent:
            nextIndex < LETTERS.length ? LETTERS[nextIndex] : WORDS[0],
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
          WORDS.length
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
        WORDS[
          wordIndex
        ];

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

      let scoring = { hardTerminate: false, metricsPending: true };

      if (wordIndex === WORDS.length - 1) {
        scoring = await safeCalculateMetrics(host.assessmentSessionId);

      }

      const isFinalWord =
        wordIndex === WORDS.length - 1;

      const nextHost = await prisma.hostSession.update({
        where: { id: host.id },
        data: {
          stage:
            isFinalWord
              ? "story_choice"
              : "word",
          currentContent:
            isFinalWord
              ? "Choose a story passage. The teacher will select it."
              : WORDS[wordIndex + 1],
          storyTitle:
            isFinalWord ? null : "",
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
        return responseJson(
          { error: "The assessment is not currently at story selection." },
          409
        );
      }

      const stories = {
        1: {
          title: "Para The Parrot",
          passage: PASSAGE_TEXT,
        },
      };

      const selected = stories[storyId];

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
          currentContent: selected.passage,
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

      const host = await prisma.hostSession.findFirst({
        where: {
          code,
          ended: false,
        },
      });

      if (!host || host.stage !== "passage") {
        return responseJson(
          { error: "Passage stage is not active." },
          409
        );
      }

      const updated =
        host.passageStartedAt
          ? host
          : await prisma.hostSession.update({
              where: { id: host.id },
              data: {
                passageStartedAt: new Date(),
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

      try {
        const result =
          await prisma.$transaction(
            async (tx) => {
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

              const updatedMetrics =
                await calculateMetrics(
                  tx,
                  host.assessmentSessionId
                );

              const updatedHost =
                await tx.hostSession.update(
                  {
                    where: {
                      id: host.id,
                    },
                    data: {
                      stage:
                        "comprehension",
                      currentContent:
                        'What must Para look for?',
                      storyTitle:
                        "Para the Parrot",
                    },
                  }
                );

              return {
                host:
                  updatedHost,
                scoring:
                  updatedMetrics,
              };
            }
          );

        return responseJson(
          {
            status:
              "ok",
            stage:
              "comprehension",
            current_content:
              result
                .host
                .currentContent,
            story_title:
              result
                .host
                .storyTitle,
            scoring:
              result.scoring,
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

      const validTypes = [
        "Insertion",
        "Omission",
        "Substitution",
        "Repetition",
        "SelfCorrection",
      ];

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

      if (!validTypes.includes(miscueType)) {
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
        questionIndex < 0
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