import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET;

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
  "The helpful child carried the basket home. Along the way, the child stopped to help a friend. They worked together and finished before sunset.";

const PASSAGE_WORD_COUNT =
  PASSAGE_TEXT.trim().split(/\s+/).length;

function response(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function getToken(request) {
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
    authorization.startsWith(
      "Bearer "
    )
  ) {
    return authorization.slice(7);
  }

  return null;
}

function getUserFromRequest(request) {
  const token = getToken(request);

  if (!token || !JWT_SECRET) {
    return null;
  }

  try {
    return jwt.verify(
      token,
      JWT_SECRET
    );
  } catch {
    return null;
  }
}

function requireTeacher(request) {
  const user =
    getUserFromRequest(request);

  if (!user) {
    return {
      error: response(
        {
          error:
            "Authentication required.",
        },
        401
      ),
    };
  }

  if (
    user.role !== "teacher" &&
    user.role !== "admin"
  ) {
    return {
      error: response(
        {
          error:
            "Teacher access required.",
        },
        403
      ),
    };
  }

  return {
    user,
  };
}

function normalizePeriod(period) {
  const value = String(
    period || "BoSY"
  ).toLowerCase();

  if (value === "bosy") {
    return "BoSY";
  }

  if (value === "mosy") {
    return "MoSY";
  }

  if (value === "eosy") {
    return "EoSY";
  }

  return null;
}

function generateCode(length = 6) {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(
      Math.random() *
        characters.length
    );

    code += characters[index];
  }

  return code;
}

async function generateUniqueCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code =
      generateCode(6);

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

function middleInitial(
  middleName
) {
  if (!middleName) {
    return "";
  }

  return `${middleName
    .trim()
    .charAt(0)
    .toUpperCase()}.`;
}

function serializeLearner(
  learner
) {
  return {
    id: learner.id,
    lrn: learner.lrn,
    first_name:
      learner.firstName,
    middle_name:
      learner.middleName || "",
    middle_initial:
      middleInitial(
        learner.middleName
      ),
    last_name:
      learner.lastName,
    suffix:
      learner.suffix || "",
    sex:
      learner.sex || "",
    grade_level:
      learner.gradeLevel,
    section:
      learner.section || "",
    created_at:
      learner.createdAt,
  };
}

function profileFromMetrics(
  accuracy,
  comprehension
) {
  if (
    accuracy === null ||
    accuracy === undefined
  ) {
    return "Not Assessed";
  }

  const readAccuracy =
    Number(accuracy);

  const comp =
    Number(comprehension || 0);

  if (readAccuracy <= 25) {
    return "High Emerging Reader";
  }

  if (
    readAccuracy >= 26 &&
    readAccuracy <= 50 &&
    comp === 0
  ) {
    return "High Emerging Reader";
  }

  if (
    readAccuracy >= 26 &&
    readAccuracy <= 50 &&
    comp >= 1
  ) {
    return "Developing Reader";
  }

  if (
    readAccuracy >= 51 &&
    readAccuracy <= 75 &&
    comp <= 2
  ) {
    return "Developing Reader";
  }

  if (
    readAccuracy >= 51 &&
    readAccuracy <= 75 &&
    comp >= 3
  ) {
    return "Transitioning Reader";
  }

  if (
    readAccuracy >= 76 &&
    readAccuracy <= 100 &&
    comp <= 4
  ) {
    return "Transitioning Reader";
  }

  if (
    readAccuracy >= 76 &&
    readAccuracy <= 100 &&
    comp >= 5
  ) {
    return "Reading at Grade Level";
  }

  return "Developing Reader";
}

function calculateAccuracy(
  correct,
  attempted
) {
  const total =
    Number(attempted || 0);

  if (total <= 0) {
    return 0;
  }

  return Math.round(
    (Number(correct || 0) /
      total) *
      100
  );
}

async function recalculateMetrics(
  tx,
  assessmentSessionId
) {
  const letters =
    await tx.letterTaskResult.findMany(
      {
        where: {
          sessionId:
            assessmentSessionId,
        },
      }
    );

  const words =
    await tx.wordTaskResult.findMany({
      where: {
        sessionId:
          assessmentSessionId,
      },
    });

  const miscues =
    await tx.passageMiscue.findMany({
      where: {
        sessionId:
          assessmentSessionId,
      },
    });

  const comprehension =
    await tx.comprehensionResult.findMany(
      {
        where: {
          sessionId:
            assessmentSessionId,
        },
      }
    );

  const task1Score =
    letters.filter(
      (item) => item.isCorrect
    ).length;

  const task2Score =
    words.filter(
      (item) => item.isCorrect
    ).length;

  const comprehensionScore =
    comprehension.filter(
      (item) => item.isCorrect
    ).length;

  const totalMiscues =
    miscues.length;

  const attemptedReadingWords =
    PASSAGE_WORD_COUNT;

  const readAccuracy =
    calculateAccuracy(
      Math.max(
        0,
        attemptedReadingWords -
          totalMiscues
      ),
      attemptedReadingWords
    );

  const classification =
    profileFromMetrics(
      readAccuracy,
      comprehensionScore
    );

  const hardTerminate =
    task1Score === 0 ||
    task1Score + task2Score <=
      10;

  let finalClassification =
    classification;

  if (task1Score === 0) {
    finalClassification =
      "Low Emerging Reader";
  } else if (
    task1Score + task2Score <=
    10
  ) {
    finalClassification =
      "Low Emerging Reader / Moderate Refresher";
  }

  const metrics =
    await tx.sessionMetrics.upsert(
      {
        where: {
          sessionId:
            assessmentSessionId,
        },
        update: {
          task1Score,
          task2Score,
          totalMiscues,
          miscueAccuracy:
            readAccuracy,
          comprehensionScore,
          classificationLabel:
            finalClassification,
        },
        create: {
          sessionId:
            assessmentSessionId,
          task1Score,
          task2Score,
          totalMiscues,
          miscueAccuracy:
            readAccuracy,
          comprehensionScore,
          classificationLabel:
            finalClassification,
        },
      }
    );

  await tx.assessmentSession.update(
    {
      where: {
        id: assessmentSessionId,
      },
      data: {
        overallClassification:
          hardTerminate ||
          comprehension.length > 0 ||
          miscues.length > 0 ||
          words.length === WORDS.length
            ? finalClassification
            : null,
        isCompleted:
          hardTerminate,
      },
    }
  );

  return {
    metrics,
    hardTerminate,
    task1Score,
    task2Score,
    comprehensionScore,
    totalMiscues,
    miscueAccuracy:
      readAccuracy,
    classification:
      finalClassification,
  };
}

/* -------------------------------------------------------------------------- */
/* GET                                                                       */
/* -------------------------------------------------------------------------- */

export async function GET(
  request
) {
  const auth =
    requireTeacher(request);

  if (auth.error) {
    return auth.error;
  }

  const { user } = auth;

  const action =
    request.nextUrl.searchParams.get(
      "action"
    );

  try {
    if (
      action === "get_learners"
    ) {
      const learners =
        await prisma.learner.findMany(
          {
            where: {
              teacherId:
                Number(user.id),
            },
            orderBy: [
              {
                lastName: "asc",
              },
              {
                firstName: "asc",
              },
            ],
          }
        );

      return response({
        status: "ok",
        learners:
          learners.map(
            serializeLearner
          ),
      });
    }

    if (
      action === "get_assessments"
    ) {
      const rawPeriod =
        request.nextUrl.searchParams.get(
          "period"
        );

      const period =
        rawPeriod
          ? normalizePeriod(
              rawPeriod
            )
          : null;

      const sessions =
        await prisma.assessmentSession.findMany(
          {
            where: {
              teacherId:
                Number(user.id),
              ...(period
                ? {
                    assessmentPeriod:
                      period,
                  }
                : {}),
            },
            include: {
              learner: true,
              sessionMetrics: true,
            },
            orderBy: {
              dateAdministered:
                "desc",
            },
          }
        );

      return response({
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
                session.sessionMetrics
                  ?.task1Score ?? 0,
              task2_score:
                session.sessionMetrics
                  ?.task2Score ?? 0,
              total_miscues:
                session.sessionMetrics
                  ?.totalMiscues ?? 0,
              miscue_accuracy:
                session.sessionMetrics
                  ? Number(
                      session.sessionMetrics
                        .miscueAccuracy
                    )
                  : null,
              comprehension_score:
                session.sessionMetrics
                  ?.comprehensionScore ??
                0,
              timer_seconds:
                session.sessionMetrics
                  ?.timerSeconds ??
                null,
              classification_label:
                session.sessionMetrics
                  ?.classificationLabel ??
                session.overallClassification ??
                null,
              learner:
                serializeLearner(
                  session.learner
                ),
            })
          ),
      });
    }

    if (
      action === "host_get"
    ) {
      const code =
        String(
          request.nextUrl.searchParams.get(
            "code"
          ) || ""
        )
          .trim()
          .toUpperCase();

      if (!code) {
        return response(
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
                Number(user.id),
            },
            include: {
              learner: true,
              assessmentSession:
                {
                  include: {
                    sessionMetrics: true,
                  },
                },
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      return response({
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
          stage: host.stage,
          current_content:
            host.currentContent,
          story_title:
            host.storyTitle,
          ended: host.ended,
          linked_at:
            host.linkedAt,
          learner:
            host.learner
              ? serializeLearner(
                  host.learner
                )
              : null,
          metrics:
            host.assessmentSession
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
                  classification:
                    host
                      .assessmentSession
                      .sessionMetrics
                      .classificationLabel,
                }
              : null,
        },
      });
    }

    return response(
      {
        error:
          action
            ? `Unknown assessment action: ${action}`
            : "Assessment action is required.",
      },
      400
    );
  } catch (error) {
    console.error(
      "Assessment GET error:",
      error
    );

    return response(
      {
        error:
          "Internal assessment server error.",
      },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST                                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(
  request
) {
  const auth =
    requireTeacher(request);

  if (auth.error) {
    return auth.error;
  }

  const { user } = auth;

  const action =
    request.nextUrl.searchParams.get(
      "action"
    );

  try {
    const body =
      await request.json();

    if (
      action === "add_learner"
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

      const suffix =
        String(
          body?.suffix || ""
        ).trim();

      const sex =
        String(
          body?.sex || ""
        ).trim();

      const section =
        String(
          body?.section ||
            ""
        ).trim();

      const gradeLevel =
        Number(
          body?.grade_level ||
            3
        );

      if (
        !lrn ||
        !lastName ||
        !firstName ||
        !sex
      ) {
        return response(
          {
            error:
              "LRN, last name, first name, and sex are required.",
          },
          400
        );
      }

      if (
        !/^\d{10,12}$/.test(lrn)
      ) {
        return response(
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
        return response(
          {
            error:
              "A learner with this LRN already exists.",
          },
          409
        );
      }

      const learner =
        await prisma.learner.create(
          {
            data: {
              lrn,
              lastName,
              firstName,
              middleName:
                middleName ||
                null,
              suffix:
                suffix ||
                null,
              sex:
                sex || null,
              gradeLevel:
                Number.isFinite(
                  gradeLevel
                )
                  ? gradeLevel
                  : 3,
              section:
                section ||
                null,
              teacherId:
                Number(user.id),
            },
          }
        );

      return response({
        status: "ok",
        learner:
          serializeLearner(
            learner
          ),
      });
    }

    if (
      action === "delete_learner"
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
        return response(
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
                Number(user.id),
            },
          }
        );

      if (!learner) {
        return response(
          {
            error:
              "Learner not found.",
          },
          404
        );
      }

      await prisma.learner.delete({
        where: {
          id: learnerId,
        },
      });

      return response({
        status: "ok",
        message:
          "Learner deleted successfully.",
      });
    }

    if (
      action === "host_start"
    ) {
      const learnerId =
        Number(
          body?.learner_id ||
            body?.learnerId
        );

      const period =
        normalizePeriod(
          body?.period
        );

      if (
        !Number.isInteger(
          learnerId
        )
      ) {
        return response(
          {
            error:
              "A valid learner is required.",
          },
          400
        );
      }

      if (!period) {
        return response(
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
                Number(user.id),
            },
          }
        );

      if (!learner) {
        return response(
          {
            error:
              "Learner does not belong to this teacher.",
          },
          404
        );
      }

      const completedPrerequisites =
        await prisma.assessmentSession.findMany(
          {
            where: {
              learnerId,
              teacherId:
                Number(user.id),
              isCompleted:
                true,
            },
            select: {
              assessmentPeriod:
                true,
            },
          }
        );

      const completedSet =
        new Set(
          completedPrerequisites.map(
            (item) =>
              item.assessmentPeriod
          )
        );

      if (
        period === "MoSY" &&
        !completedSet.has(
          "BoSY"
        )
      ) {
        return response(
          {
            error:
              "Please complete BoSY before starting MoSY.",
          },
          400
        );
      }

      if (
        period === "EoSY" &&
        !completedSet.has(
          "BoSY"
        ) &&
        !completedSet.has(
          "MoSY"
        )
      ) {
        return response(
          {
            error:
              "Please complete BoSY or MoSY before starting EoSY.",
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
                Number(user.id),
              assessmentPeriod:
                period,
              isCompleted:
                true,
            },
          }
        );

      if (alreadyCompleted) {
        return response(
          {
            error:
              `${period} is already completed for this learner.`,
          },
          400
        );
      }

      const activeExisting =
        await prisma.hostSession.findFirst(
          {
            where: {
              teacherId:
                Number(user.id),
              learnerId,
              ended: false,
            },
          }
        );

      if (activeExisting) {
        return response(
          {
            status: "ok",
            code:
              activeExisting.code,
            existing: true,
          }
        );
      }

      const code =
        await generateUniqueCode();

      const assessment =
        await prisma.assessmentSession.create(
          {
            data: {
              learnerId,
              teacherId:
                Number(user.id),
              assessmentPeriod:
                period,
              dateAdministered:
                new Date(),
            },
          }
        );

      const host =
        await prisma.hostSession.create(
          {
            data: {
              code,
              teacherId:
                Number(user.id),
              learnerId,
              assessmentSessionId:
                assessment.id,
              stage: "waiting",
              currentContent:
                "Waiting for learner to connect...",
              storyTitle: null,
            },
          }
        );

      return response({
        status: "ok",
        code: host.code,
        host_session_id:
          host.id,
        assessment_session_id:
          assessment.id,
        learner_id:
          learnerId,
        period,
      });
    }

    if (
      action === "host_end"
    ) {
      const code =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      if (!code) {
        return response(
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
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Active assessment session not found.",
          },
          404
        );
      }

      await prisma.$transaction(
        async (tx) => {
          if (
            host.assessmentSessionId
          ) {
            await tx.assessmentSession.update(
              {
                where: {
                  id:
                    host.assessmentSessionId,
                },
                data: {
                  isCompleted: true,
                },
              }
            );

            await recalculateMetrics(
              tx,
              host.assessmentSessionId
            );
          }

          await tx.hostSession.update(
            {
              where: {
                id: host.id,
              },
              data: {
                ended: true,
                stage: "ended",
                currentContent:
                  "Assessment ended.",
              },
            }
          );
        }
      );

      return response({
        status: "ok",
      });
    }

    if (
      action === "host_update"
    ) {
      const code =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      if (!code) {
        return response(
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
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
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
          String(
            body.currentContent
          );
      }

      if (
        body?.storyTitle !==
        undefined
      ) {
        data.storyTitle =
          body.storyTitle
            ? String(
                body.storyTitle
              )
            : null;
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

      return response({
        status: "ok",
        session: {
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
        },
      });
    }

    if (
      action === "record_letter"
    ) {
      const hostCode =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      const letterIndex =
        Number(
          body?.letter_index
        );

      const letter =
        String(
          body?.letter ||
            ""
        ).trim();

      const isCorrect =
        Boolean(
          body?.is_correct
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code: hostCode,
              teacherId:
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      if (
        !Number.isInteger(
          letterIndex
        ) ||
        letterIndex < 0 ||
        letterIndex >=
          LETTERS.length
      ) {
        return response(
          {
            error:
              "Invalid letter index.",
          },
          400
        );
      }

      const expected =
        LETTERS[letterIndex];

      if (
        letter.toUpperCase() !==
        expected
      ) {
        return response(
          {
            error:
              "Letter does not match the expected item.",
          },
          400
        );
      }

      const result =
        await prisma.letterTaskResult.upsert(
          {
            where: {
              sessionId_letterIndex:
                {
                  sessionId:
                    host.assessmentSessionId,
                  letterIndex,
                },
            },
            update: {
              letter:
                expected,
              isCorrect:
                isCorrect,
            },
            create: {
              sessionId:
                host.assessmentSessionId,
              letterIndex,
              letter:
                expected,
              isCorrect,
            },
          }
        );

      const scoring =
        await prisma.$transaction(
          async (tx) =>
            recalculateMetrics(
              tx,
              host.assessmentSessionId
            )
        );

      if (
        scoring.hardTerminate
      ) {
        await prisma.hostSession.update(
          {
            where: {
              id: host.id,
            },
            data: {
              ended: true,
              stage: "terminated",
              currentContent:
                scoring.task1Score ===
                0
                  ? "Assessment terminated. Low Emerging Reader."
                  : "Assessment terminated. Low Emerging Reader / Moderate Refresher.",
            },
          }
        );
      }

      return response({
        status: "ok",
        result,
        scoring,
      });
    }

    if (
      action === "record_word"
    ) {
      const hostCode =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      const wordIndex =
        Number(
          body?.word_index
        );

      const word =
        String(
          body?.word ||
            ""
        ).trim();

      const isCorrect =
        Boolean(
          body?.is_correct
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code: hostCode,
              teacherId:
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      if (
        !Number.isInteger(
          wordIndex
        ) ||
        wordIndex < 0 ||
        wordIndex >=
          WORDS.length
      ) {
        return response(
          {
            error:
              "Invalid word index.",
          },
          400
        );
      }

      const expected =
        WORDS[wordIndex];

      if (
        word.toLowerCase() !==
        expected
      ) {
        return response(
          {
            error:
              "Word does not match the expected item.",
          },
          400
        );
      }

      const result =
        await prisma.wordTaskResult.upsert(
          {
            where: {
              sessionId_wordIndex:
                {
                  sessionId:
                    host.assessmentSessionId,
                  wordIndex,
                },
            },
            update: {
              word:
                expected,
              isCorrect:
                isCorrect,
            },
            create: {
              sessionId:
                host.assessmentSessionId,
              wordIndex,
              word:
                expected,
              isCorrect,
            },
          }
        );

      const scoring =
        await prisma.$transaction(
          async (tx) =>
            recalculateMetrics(
              tx,
              host.assessmentSessionId
            )
        );

      if (
        scoring.hardTerminate
      ) {
        await prisma.hostSession.update(
          {
            where: {
              id: host.id,
            },
            data: {
              ended: true,
              stage: "terminated",
              currentContent:
                "Assessment terminated.",
            },
          }
        );
      }

      return response({
        status: "ok",
        result,
        scoring,
      });
    }

    if (
      action ===
      "record_passage_miscue"
    ) {
      const hostCode =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      const wordIndex =
        Number(
          body?.word_index
        );

      const miscueType =
        String(
          body?.miscue_type ||
            ""
        ).trim();

      const misreadWord =
        String(
          body?.misread_word ||
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
        !validTypes.includes(
          miscueType
        )
      ) {
        return response(
          {
            error:
              "Invalid miscue type.",
          },
          400
        );
      }

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code: hostCode,
              teacherId:
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      const result =
        await prisma.passageMiscue.create(
          {
            data: {
              sessionId:
                host.assessmentSessionId,
              wordIndex,
              miscueType,
              misreadWord:
                misreadWord ||
                null,
            },
          }
        );

      const scoring =
        await prisma.$transaction(
          async (tx) =>
            recalculateMetrics(
              tx,
              host.assessmentSessionId
            )
        );

      return response({
        status: "ok",
        result,
        scoring,
      });
    }

    if (
      action ===
      "record_comprehension"
    ) {
      const hostCode =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      const questionIndex =
        Number(
          body?.question_index
        );

      const isCorrect =
        Boolean(
          body?.is_correct
        );

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code: hostCode,
              teacherId:
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
          },
          404
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
                id: existing.id,
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
          async (tx) =>
            recalculateMetrics(
              tx,
              host.assessmentSessionId
            )
        );

      return response({
        status: "ok",
        result,
        scoring,
      });
    }

    if (
      action === "finalize"
    ) {
      const code =
        String(
          body?.code || ""
        )
          .trim()
          .toUpperCase();

      const host =
        await prisma.hostSession.findFirst(
          {
            where: {
              code,
              teacherId:
                Number(user.id),
              ended: false,
            },
          }
        );

      if (!host) {
        return response(
          {
            error:
              "Assessment session not found.",
          },
          404
        );
      }

      const scoring =
        await prisma.$transaction(
          async (tx) => {
            const result =
              await recalculateMetrics(
                tx,
                host.assessmentSessionId
              );

            await tx.assessmentSession.update(
              {
                where: {
                  id:
                    host.assessmentSessionId,
                },
                data: {
                  isCompleted:
                    true,
                  overallClassification:
                    result.classification,
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
                  stage: "completed",
                  currentContent:
                    "Assessment completed.",
                },
              }
            );

            return result;
          }
        );

      return response({
        status: "ok",
        scoring,
      });
    }

    return response(
      {
        error:
          action
            ? `Unknown assessment action: ${action}`
            : "Assessment action is required.",
      },
      400
    );
  } catch (error) {
    console.error(
      "Assessment POST error:",
      error
    );

    return response(
      {
        error:
          "Internal assessment server error.",
      },
      500
    );
  }
}