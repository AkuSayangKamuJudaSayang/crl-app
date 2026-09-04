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
const API_VERSION = "2026-09-02-assessment-v5";

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

const STORIES = [
  {
    id: 1,
    title: "Para The Parrot",
    description:
      "A story about a parrot flying to the market.",
    text: PASSAGE_TEXT,
    questions: [
      "What must Para look for?",
      "What time or part of the day is it?",
      "What does Para land on?",
      "Who does Para see?",
      "What else is the police officer doing besides directing traffic?",
      "What could the police officer be feeling?",
    ],
  },
  {
    id: 2,
    title: "A Day In The Fields",
    description:
      "Join the farmers as they work in the terraces.",
    text:
      "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.",
    questions: [
      "Who is Dulnuwan?",
      "Who helps Dulnuwan in the fields?",
      "What does Dulnuwan prepare?",
      "What do the workers do all morning?",
      "Where do they rest and eat lunch?",
      "How does Dulnuwan feel about their work?",
    ],
  },
];

function getStoryByTitle(title) {
  return (
    STORIES.find(
      (story) =>
        story.title.toLowerCase() ===
        String(title || "")
          .trim()
          .toLowerCase()
    ) || STORIES[0]
  );
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

function normalizeExperienceRating(
  value
) {
  const rating =
    Number(value);

  return Number.isInteger(rating) &&
    rating >= 1 &&
    rating <= 5
    ? rating
    : null;
}

function normalizeObservationLevel(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const level =
    Number(value);

  return Number.isInteger(level) &&
    level >= 1 &&
    level <= 4
    ? level
    : null;
}

function normalizeRemarks(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const remarks =
    String(value).trim();

  return remarks
    ? remarks.slice(0, 5000)
    : null;
}

async function findLiveHostByCode(
  code
) {
  return prisma.hostSession.findUnique({
    where: {
      code,
    },
    select: {
      id: true,
      learnerId: true,
      stage: true,
      currentContent: true,
      storyTitle: true,
      ended: true,
      linkedAt: true,
      assessmentSessionId: true,
      updatedAt: true,
      assessmentSession: {
        select: {
          isCompleted: true,
          assessmentPeriod: true,
        },
      },
    },
  });
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
        false,
      hardTerminateStage:
        null,
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

  /*
   * The Grade 3 English CRLA scoresheet uses a 100-word passage.
   * Reading accuracy is therefore 100 minus the total number of miscues.
   * Unread words after the two-minute limit are treated as miscues.
   */
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
    existingSessionMetrics?.timerSeconds ??
    null;

  const wordsRead =
    Math.max(
      0,
      passageWordCount -
        totalMiscues
    );

  const miscueAccuracy =
    Number(
      (
        wordsRead
      ).toFixed(2)
    );

  const passageStarted =
    miscues.length > 0 ||
    comprehension.length > 0 ||
    timerSeconds !== null;

  const wpm =
    timerSeconds &&
    timerSeconds > 0
      ? Number(
          (
            (wordsRead /
              timerSeconds) *
            60
          ).toFixed(2)
        )
      : null;

  const part1 =
    calculatePart1Profile(
      task1Score,
      task2Score,
      task1Complete,
      task2Complete
    );

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
              "Assessment completed. The CRLA stop rule was reached.",
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
      const host =
        await findLiveHostByCode(
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

      const completed =
        Boolean(
          host
            .assessmentSession
            ?.isCompleted
        );

      const connected =
        !host.ended &&
        !completed &&
        Boolean(host.learnerId) &&
        isRecentlyConnected(
          host.linkedAt
        );

      const effectiveStage =
        completed
          ? (
              host.stage ===
              "terminated"
                ? "terminated"
                : "completed"
            )
          : (
              connected &&
              (
                host.stage ===
                  "waiting" ||
                host.stage ===
                  "connected"
              )
                ? "letter"
                : host.stage
            );

      const effectiveContent =
        !host.ended &&
        connected &&
        (
          host.stage ===
            "waiting" ||
          host.stage ===
            "connected"
        )
          ? (
              host.currentContent ||
              LETTERS[0]
            )
          : (
              host.currentContent ||
              ""
            );

      let scoring = null;

      if (
        host.ended ||
        completed
      ) {
        const metrics =
          host.assessmentSessionId
            ? await prisma.sessionMetrics.findUnique(
                {
                  where: {
                    sessionId:
                      host.assessmentSessionId,
                  },
                  select: {
                    task1Score: true,
                    task2Score: true,
                    totalMiscues: true,
                    miscueAccuracy: true,
                    comprehensionScore: true,
                    timerSeconds: true,
                    classificationLabel: true,
                  },
                }
              )
            : null;

        if (metrics) {
          const wordsRead =
            Math.max(
              0,
              getPassageWordCount() -
                Number(
                  metrics.totalMiscues ||
                    0
                )
            );

          const wpm =
            metrics.timerSeconds &&
            metrics.timerSeconds > 0
              ? Number(
                  (
                    (
                      wordsRead /
                      metrics.timerSeconds
                    ) *
                    60
                  ).toFixed(2)
                )
              : null;

          scoring = {
            task1Score:
              metrics.task1Score,
            task2Score:
              metrics.task2Score,
            totalMiscues:
              metrics.totalMiscues,
            miscueAccuracy:
              metrics.miscueAccuracy,
            comprehensionScore:
              metrics.comprehensionScore,
            timerSeconds:
              metrics.timerSeconds,
            wpm,
            classification:
              metrics.classificationLabel ||
              host
                .assessmentSession
                ?.overallClassification ||
              (
                Number(
                  metrics.task1Score ||
                  0
                ) === 0
                  ? "Low Emerging Reader"
                  : null
              ),
            experienceRating:
              metrics.experienceRating,
            observationLevel:
              metrics.observationLevel,
            remarks:
              metrics.remarks,
            totalScore:
              Number(
                metrics.task1Score ||
                  0
              ) +
              Number(
                metrics.task2Score ||
                  0
              ) +
              Number(
                metrics.comprehensionScore ||
                  0
              ),
          };
        }
      }

      return responseJson({
        status: "ok",
        connected,
        completed,
        ended:
          host.ended,
        stage:
          effectiveStage,
        current_content:
          effectiveContent,
        story_title:
          host.storyTitle,
        learner_id:
          host.learnerId,
        updated_at:
          host.updatedAt,
        scoring,
        stories:
          STORIES.map(
            ({
              id,
              title,
            }) => ({
              id,
              title,
            })
          ),
        timer_paused:
          host.stage ===
          "passage_paused",
        period:
          host
            .assessmentSession
            ?.assessmentPeriod ||
          null,
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


  if (
    action ===
    "save_experience_rating"
  ) {
    const code =
      normalizeCode(
        body?.code
      );

    const learnerId =
      Number(
        body?.learner_id ??
          body?.learnerId ??
          0
      );

    const rating =
      normalizeExperienceRating(
        body?.experience_rating ??
          body?.experienceRating
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

    if (
      !Number.isInteger(
        learnerId
      ) ||
      learnerId <= 0
    ) {
      return responseJson(
        {
          error:
            "Learner is required.",
        },
        400
      );
    }

    if (rating === null) {
      return responseJson(
        {
          error:
            "Experience rating must be from 1 to 5.",
        },
        400
      );
    }

    try {
      const host =
        await prisma.hostSession.findUnique(
          {
            where: {
              code,
            },
            select: {
              learnerId: true,
              ended: true,
              assessmentSessionId:
                true,
              assessmentSession: {
                select: {
                  isCompleted:
                    true,
                },
              },
            },
          }
        );

      if (
        !host ||
        host.learnerId !==
          learnerId ||
        !host.assessmentSessionId
      ) {
        return responseJson(
          {
            error:
              "Assessment session not found for this learner.",
          },
          404
        );
      }

      if (
        !host.ended &&
        !host.assessmentSession
          ?.isCompleted
      ) {
        return responseJson(
          {
            error:
              "The assessment is not yet complete.",
          },
          409
        );
      }

      const metrics =
        await prisma.sessionMetrics.upsert(
          {
            where: {
              sessionId:
                host.assessmentSessionId,
            },
            update: {
              experienceRating:
                rating,
            },
            create: {
              sessionId:
                host.assessmentSessionId,
              experienceRating:
                rating,
            },
          }
        );

      return responseJson({
        status: "ok",
        experience_rating:
          metrics.experienceRating,
      });
    } catch (error) {
      console.error(
        "save_experience_rating error:",
        error
      );

      return responseJson(
        {
          error:
            "Unable to save the experience rating.",
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

              experience_rating:
                session
                  .sessionMetrics
                  ?.experienceRating ||
                null,

              observation_level:
                session
                  .sessionMetrics
                  ?.observationLevel ||
                null,

              remarks:
                session
                  .sessionMetrics
                  ?.remarks ||
                null,

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

      const connected =
        !host.ended &&
        Boolean(host.learnerId) &&
        Boolean(host.learner) &&
        isRecentlyConnected(
          host.linkedAt
        );

      const passageMiscues =
        host.assessmentSessionId
          ? await prisma.passageMiscue.findMany({
              where: {
                sessionId:
                  host.assessmentSessionId,
              },
              select: {
                wordIndex:
                  true,
                miscueType:
                  true,
              },
              orderBy: {
                wordIndex:
                  "asc",
              },
            })
          : [];

      /*
       * host_get is a read path. The assessment item is only exposed after a
       * learner has genuinely claimed the session and remains inside the
       * heartbeat window. No stage write is performed during polling.
       */
      let stage =
        host.stage;

      let currentContent =
        host.currentContent;

      if (
        stage ===
        "passage_paused"
      ) {
        currentContent =
          host.currentContent;
      }

      if (
        connected &&
        (
          stage ===
            "waiting" ||
          stage ===
            "connected"
        )
      ) {
        stage =
          "letter";

        currentContent =
          host.currentContent ||
          LETTERS[0];
      }

      if (!connected) {
        stage =
          "waiting";

        currentContent =
          null;
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
          assessment_completed:
            Boolean(
              host
                .assessmentSession
                ?.isCompleted
            ),
          connected,
          linked_at:
            host.linkedAt,
          updated_at:
            host.updatedAt,
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
                      .classificationLabel ||
                    host
                      .assessmentSession
                      .overallClassification ||
                    (
                      Number(
                        host
                          .assessmentSession
                          .sessionMetrics
                          .task1Score ||
                          0
                      ) === 0
                        ? "Low Emerging Reader"
                        : calculatePart1ReadingLevel(
                            Number(
                              host
                                .assessmentSession
                                .sessionMetrics
                                .task1Score ||
                                0
                            ) +
                            Number(
                              host
                                .assessmentSession
                                .sessionMetrics
                                .task2Score ||
                                0
                            )
                          )
                    ),
                  classificationLabel:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .classificationLabel ||
                    host
                      .assessmentSession
                      .overallClassification ||
                    (
                      Number(
                        host
                          .assessmentSession
                          .sessionMetrics
                          .task1Score ||
                          0
                      ) === 0
                        ? "Low Emerging Reader"
                        : null
                    ),
                  miscues:
                    passageMiscues.map(
                      (miscue) => ({
                        wordIndex:
                          miscue.wordIndex,
                        miscueType:
                          miscue.miscueType,
                      })
                    ),

                  experienceRating:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .experienceRating,

                  observationLevel:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .observationLevel,

                  remarks:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .remarks,
                }
              : null,
          timer_paused:
            stage ===
            "passage_paused",
          stories:
            STORIES.map(
              ({
                id,
                title,
              }) => ({
                id,
                title,
              })
            ),
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
        await findLiveHostByCode(
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

      await prisma.hostSession.update(
        {
          where: {
            id: host.id,
          },
          data: {
            linkedAt:
              new Date(),
          },
        }
      );

      return responseJson({
        status: "ok",
        connected: true,
        completed: false,
        ended: false,
        stage:
          host.stage,
        current_content:
          host.currentContent,
        story_title:
          host.storyTitle,
        period:
          host
            .assessmentSession
            ?.assessmentPeriod ||
          null,
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

    if (
      action ===
      "save_teacher_feedback"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      const observationLevel =
        normalizeObservationLevel(
          body?.observation_level ??
            body?.observationLevel
        );

      const remarks =
        normalizeRemarks(
          body?.remarks
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
            select: {
              assessmentSessionId:
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
              "Assessment session not found.",
          },
          404
        );
      }

      if (
        observationLevel === null &&
        remarks === null
      ) {
        return responseJson(
          {
            error:
              "Provide an observation level or remarks.",
          },
          400
        );
      }

      const metrics =
        await prisma.sessionMetrics.upsert(
          {
            where: {
              sessionId:
                host.assessmentSessionId,
            },
            update: {
              observationLevel,
              remarks,
            },
            create: {
              sessionId:
                host.assessmentSessionId,
              observationLevel,
              remarks,
            },
          }
        );

      return responseJson({
        status: "ok",
        observation_level:
          metrics.observationLevel,
        remarks:
          metrics.remarks,
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
          body?.lrn ??
            body?.LRN ??
            ""
        )
          .replace(
            /\D/g,
            ""
          )
          .trim();

      const lastName =
        String(
          body?.last_name ??
            body?.lastName ??
            ""
        ).trim();

      const firstName =
        String(
          body?.first_name ??
            body?.firstName ??
            ""
        ).trim();

      const middleName =
        String(
          body?.middle_name ??
            body?.middleName ??
            ""
        ).trim();

      const sex =
        String(
          body?.sex ??
            body?.gender ??
            ""
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
        await prisma.learner.findUnique({
          where: {
            lrn,
          },
        });

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
        await prisma.user.findUnique({
          where: {
            id:
              userId,
          },
          select: {
            section:
              true,
          },
        });

      const requestedGrade =
        Number(
          body?.grade_level ??
            body?.gradeLevel ??
            3
        );

      const learner =
        await prisma.learner.create({
          data: {
            lrn,
            firstName,
            lastName,
            middleName:
              middleName ||
              null,
            sex,
            gradeLevel:
              Number.isInteger(
                requestedGrade
              ) &&
              requestedGrade > 0
                ? requestedGrade
                : 3,
            section:
              teacher?.section ||
              String(
                body?.section ??
                  ""
              ).trim() ||
              null,
            teacherId:
              userId,
          },
        });

      return responseJson({
        status:
          "ok",
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
      const candidate =
        body?.learner &&
        typeof body.learner ===
          "object"
          ? body.learner
          : {};

      const requestedId =
        Number(
          body?.learner_id ??
            body?.learnerId ??
            body?.id ??
            candidate.id ??
            candidate.learner_id ??
            candidate.learnerId ??
            0
        );

      const requestedLrn =
        String(
          body?.lrn ??
            body?.LRN ??
            candidate.lrn ??
            candidate.LRN ??
            ""
        ).trim();

      const firstName =
        String(
          body?.first_name ??
            body?.firstName ??
            candidate.first_name ??
            candidate.firstName ??
            ""
        ).trim();

      const lastName =
        String(
          body?.last_name ??
            body?.lastName ??
            candidate.last_name ??
            candidate.lastName ??
            ""
        ).trim();

      const middleName =
        String(
          body?.middle_name ??
            body?.middleName ??
            candidate.middle_name ??
            candidate.middleName ??
            ""
        ).trim();

      const hasValidId =
        Number.isInteger(
          requestedId
        ) &&
        requestedId > 0;

      const hasLrn =
        Boolean(
          requestedLrn
        );

      const hasName =
        Boolean(
          firstName &&
          lastName
        );

      if (
        !hasValidId &&
        !hasLrn &&
        !hasName
      ) {
        return responseJson(
          {
            error:
              "Unable to identify the learner. The selected learner did not contain a usable ID, LRN, or name.",
          },
          400
        );
      }

      let learner =
        null;

      if (
        hasValidId
      ) {
        learner =
          await prisma.learner.findFirst({
            where: {
              id:
                requestedId,
              teacherId:
                userId,
            },
          });
      }

      if (
        !learner &&
        hasLrn
      ) {
        learner =
          await prisma.learner.findFirst({
            where: {
              lrn:
                requestedLrn,
              teacherId:
                userId,
            },
          });
      }

      if (
        !learner &&
        hasName
      ) {
        learner =
          await prisma.learner.findFirst({
            where: {
              teacherId:
                userId,
              firstName,
              lastName,
              ...(middleName &&
              middleName !==
                "N/A"
                ? {
                    middleName,
                  }
                : {}),
            },
            orderBy: {
              id:
                "asc",
            },
          });
      }

      if (
        !learner &&
        hasName &&
        middleName
      ) {
        learner =
          await prisma.learner.findFirst({
            where: {
              teacherId:
                userId,
              firstName,
              lastName,
            },
            orderBy: {
              id:
                "asc",
            },
          });
      }

      if (!learner) {
        return responseJson(
          {
            error:
              "Learner not found.",
          },
          404
        );
      }

      await prisma.learner.delete({
        where: {
          id:
            learner.id,
        },
      });

      return responseJson({
        status:
          "ok",
        deleted_learner_id:
          learner.id,
        deleted_lrn:
          learner.lrn,
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
       * End Session cancels the current attempt. It must not complete the
       * assessment and it must not leave partial results in the records.
       * Reset the in-progress rows and close the host atomically.
       */
      await prisma.$transaction(
        async (tx) => {
          if (
            host.assessmentSessionId
          ) {
            await tx.letterTaskResult.deleteMany({
              where: {
                sessionId:
                  host.assessmentSessionId,
              },
            });

            await tx.wordTaskResult.deleteMany({
              where: {
                sessionId:
                  host.assessmentSessionId,
              },
            });

            await tx.passageMiscue.deleteMany({
              where: {
                sessionId:
                  host.assessmentSessionId,
              },
            });

            await tx.comprehensionResult.deleteMany({
              where: {
                sessionId:
                  host.assessmentSessionId,
              },
            });

            await tx.sessionMetrics.deleteMany({
              where: {
                sessionId:
                  host.assessmentSessionId,
              },
            });

            await tx.assessmentSession.update({
              where: {
                id:
                  host.assessmentSessionId,
              },
              data: {
                isCompleted:
                  false,
                overallClassification:
                  null,
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

      const isFinalLetter = letterIndex === LETTERS.length - 1;

      if (!isFinalLetter) {
        const updatedHost = await prisma.hostSession.update({
          where: { id: host.id },
          data: {
            stage: "letter",
            currentContent: LETTERS[letterIndex + 1],
            storyTitle: "",
          },
        });

        return responseJson({
          status: "ok",
          result,
          completed: false,
          terminated: false,
          updated_at: updatedHost.updatedAt,
          next: {
            stage: "letter",
            index: letterIndex + 1,
            content: LETTERS[letterIndex + 1],
            storyTitle: "",
          },
        });
      }

      const scoring = await prisma.$transaction(
        (tx) => calculateMetrics(tx, host.assessmentSessionId)
      );

      if (scoring.hardTerminate) {
        await completeEarlyTermination(
          host.id,
          host.assessmentSessionId,
          scoring
        );

        return responseJson({
          status: "ok",
          result,
          completed: true,
          terminated: true,
          scoring,
        });
      }

      const nextIndex =
        letterIndex <
        LETTERS.length - 1
          ? letterIndex + 1
          : 0;

      const nextStage =
        letterIndex <
        LETTERS.length - 1
          ? "letter"
          : "word";

      const nextContent =
        letterIndex <
        LETTERS.length - 1
          ? LETTERS[
              letterIndex + 1
            ]
          : WORDS[0];

      const updatedHost =
        await prisma.hostSession.update({
          where: {
            id:
              host.id,
          },
          data: {
            stage:
              nextStage,
            currentContent:
              nextContent,
            storyTitle:
              "",
          },
        });

      return responseJson({
        status: "ok",
        result,
        completed: false,
        terminated: false,
        scoring,
        updated_at:
          updatedHost.updatedAt,
        next: {
          stage:
            nextStage,
          index:
            nextIndex,
          content:
            nextContent,
          storyTitle:
            "",
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

      const isFinalWord = wordIndex === WORDS.length - 1;

      if (!isFinalWord) {
        const updatedHost = await prisma.hostSession.update({
          where: { id: host.id },
          data: {
            stage: "word",
            currentContent: WORDS[wordIndex + 1],
            storyTitle: null,
          },
        });

        return responseJson({
          status: "ok",
          result,
          completed: false,
          terminated: false,
          updated_at: updatedHost.updatedAt,
          next: {
            stage: "word",
            index: wordIndex + 1,
            content: WORDS[wordIndex + 1],
            storyTitle: null,
          },
        });
      }

      const scoring = await prisma.$transaction(
        (tx) => calculateMetrics(tx, host.assessmentSessionId)
      );

      if (scoring.hardTerminate) {
        await completeEarlyTermination(
          host.id,
          host.assessmentSessionId,
          scoring
        );

        return responseJson({
          status: "ok",
          result,
          completed: true,
          terminated: true,
          scoring,
        });
      }

      const hasNextWord =
        wordIndex <
        WORDS.length - 1;

      const nextIndex =
        hasNextWord
          ? wordIndex + 1
          : 0;

      const nextStage =
        hasNextWord
          ? "word"
          : "story_choice";

      const nextContent =
        hasNextWord
          ? WORDS[
              wordIndex + 1
            ]
          : "";

      const updatedHost =
        await prisma.hostSession.update({
          where: {
            id:
              host.id,
          },
          data: {
            stage:
              nextStage,
            currentContent:
              nextContent,
            storyTitle:
              null,
          },
        });

      return responseJson({
        status: "ok",
        result,
        completed: false,
        terminated: false,
        scoring,
        updated_at:
          updatedHost.updatedAt,
        next: {
          stage:
            nextStage,
          index:
            nextIndex,
          content:
            nextContent,
          storyTitle:
            "",
        },
      });
    }

    /* ====================================================================== */
    /* SELECT STORY                                                            */
    /* ====================================================================== */

    if (
      action ===
      "select_story"
    ) {
      const code =
        normalizeCode(
          body?.code
        );

      const storyId =
        Number(
          body?.story_id ??
            body?.storyId
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
        await prisma.hostSession.findFirst({
          where: {
            code,
            teacherId:
              userId,
            ended: false,
          },
          select: {
            id: true,
            assessmentSessionId:
              true,
            learnerId:
              true,
            stage:
              true,
          },
        });

      if (
        !host ||
        !host.assessmentSessionId ||
        !host.learnerId
      ) {
        return responseJson(
          {
            error:
              "Active connected assessment session not found.",
          },
          404
        );
      }

      const story =
        STORIES.find(
          (item) =>
            item.id ===
            storyId
        );

      if (!story) {
        return responseJson(
          {
            error:
              "Invalid story selection.",
          },
          400
        );
      }

      const updated =
        await prisma.hostSession.update({
          where: {
            id:
              host.id,
          },
          data: {
            stage:
              "passage",
            currentContent:
              story.text,
            storyTitle:
              story.title,
          },
        });

      return responseJson({
        status:
          "ok",
        stage:
          "passage",
        current_content:
          updated.currentContent,
        story_title:
          updated.storyTitle,
        updated_at:
          updated.updatedAt,
        stories:
          STORIES.map(
            ({
              id,
              title,
            }) => ({
              id,
              title,
            })
          ),
      });
    }

    /* ====================================================================== */
    /* PASSAGE TIMER PAUSE / RESUME                                           */
    /* ====================================================================== */

    if (
      action ===
      "passage_timer"
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
        await prisma.hostSession.findFirst({
          where: {
            code,
            teacherId:
              userId,
            ended: false,
          },
        });

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
          "passage" &&
        host.stage !==
          "passage_paused"
      ) {
        return responseJson(
          {
            error:
              "The assessment is not currently in the passage stage.",
          },
          409
        );
      }

      const paused =
        Boolean(
          body?.paused
        );

      const timerSeconds =
        Math.min(
          120,
          Math.max(
            0,
            Math.round(
              Number(
                body?.timer_seconds ??
                  body?.timerSeconds ??
                  0
              )
            )
          )
        );

      const [metrics, updatedHost] =
        await prisma.$transaction(
          async (tx) => {
            const metrics =
              await tx.sessionMetrics.upsert({
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
              });

            const updatedHost =
              await tx.hostSession.update({
                where: {
                  id:
                    host.id,
                },
                data: {
                  stage:
                    paused
                      ? "passage_paused"
                      : "passage",
                },
              });

            return [
              metrics,
              updatedHost,
            ];
          }
        );

      return responseJson({
        status:
          "ok",
        stage:
          updatedHost.stage,
        timer_seconds:
          metrics.timerSeconds,
        paused:
          paused,
        updated_at:
          updatedHost.updatedAt,
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

      /*
       * The client uses an offline-first outbox. A request can therefore be
       * delivered again after the original response was lost. Treat an already
       * completed passage as an idempotent success instead of leaving a
       * permanently retrying outbox item.
       */
      if (host.stage === "comprehension") {
        const selectedStory = getStoryByTitle(host.storyTitle);
        return responseJson({
          status: "ok",
          stage: "comprehension",
          current_content: selectedStory?.questions?.[0] || host.currentContent,
          story_title: selectedStory?.title || host.storyTitle,
          scoring: host.assessmentSession?.sessionMetrics || null,
          already_completed: true,
        });
      }

      if (
        host.stage !==
          "passage" &&
        host.stage !==
          "passage_paused"
      ) {
        return responseJson(
          {
            error:
              "The assessment is not currently in the passage stage.",
          },
          409
        );
      }

      const timerSeconds = Math.min(
        120,
        Math.max(
          0,
          Number(
            body?.timer_seconds ??
              body?.timerSeconds ??
              0
          )
        )
      );

      const wordsReadByLearner =
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

              const selectedStory =
                getStoryByTitle(
                  host.storyTitle
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
                        selectedStory
                          .questions[0],
                      storyTitle:
                        selectedStory.title,
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
        "Reversion",
        "SelfCorrection",
      ];

      if (
        !validTypes.includes(
          miscueType
        )
      ) {
        return responseJson(
          {
            error:
              "Invalid miscue type.",
          },
          400
        );
      }

      if (
        !Number.isInteger(wordIndex) ||
        wordIndex < 0 ||
        wordIndex >= getPassageWordCount()
      ) {
        return responseJson(
          {
            error:
              "Invalid passage word index.",
          },
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
        });

      let result;

      if (existing) {
        result =
          await prisma.passageMiscue.update({
            where: {
              id:
                existing.id,
            },
            data: {
              miscueType,
              misreadWord:
                misreadWord ||
                null,
            },
          });
      } else {
        result =
          await prisma.passageMiscue.create({
            data: {
              sessionId:
                host.assessmentSessionId,
              wordIndex,
              miscueType,
              misreadWord:
                misreadWord ||
                null,
            },
          });
      }

      return responseJson({
        status: "ok",
        result,
        scoring: null,
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
        await prisma.$transaction(
          (tx) =>
            calculateMetrics(
              tx,
              host.assessmentSessionId
            )
        );

      const hasNextQuestion =
        questionIndex <
        QUESTIONS.length - 1;

      const nextQuestionIndex =
        hasNextQuestion
          ? questionIndex + 1
          : 0;

      const nextQuestionContent =
        hasNextQuestion
          ? QUESTIONS[questionIndex + 1].text
          : "";

      const isFinalQuestion =
        questionIndex >=
        QUESTIONS.length - 1;

      if (isFinalQuestion) {
        await prisma.$transaction(
          async (tx) => {
            await tx.assessmentSession.update({
              where: {
                id:
                  host.assessmentSessionId,
              },
              data: {
                isCompleted:
                  true,
                overallClassification:
                  scoring.classification,
              },
            });

            await tx.hostSession.update({
              where: {
                id:
                  host.id,
              },
              data: {
                ended:
                  true,
                stage:
                  "completed",
                currentContent:
                  "Assessment completed.",
                linkedAt:
                  null,
              },
            });
          }
        );

        return responseJson({
          status: "ok",
          result,
          completed: true,
          terminated: false,
          scoring,
          next: {
            stage:
              "completed",
            index:
              questionIndex,
            content:
              "Assessment completed.",
          },
        });
      }

      const nextIndex =
        questionIndex + 1;

      const nextContent =
        QUESTIONS[
          nextIndex
        ].text;

      await prisma.hostSession.update({
        where: {
          id:
            host.id,
        },
        data: {
          stage:
            "comprehension",
          currentContent:
            nextContent,
          storyTitle:
            "Para the Parrot",
        },
      });

      return responseJson({
        status: "ok",
        result,
        completed: false,
        terminated: false,
        scoring,
        next: {
          stage:
            "comprehension",
          index:
            nextIndex,
          content:
            nextContent,
          storyTitle:
            "Para the Parrot",
        },
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