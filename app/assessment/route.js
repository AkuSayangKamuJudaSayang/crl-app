import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { jwtVerify } from "jose";

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__crla_prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__crla_prisma = prisma;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "change-this-secret-in-production"
);

const SESSION_COOKIE = "crla_session";

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

const STORY_TITLE = "Para the Parrot";

const STORY_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

const VALID_PERIODS = new Set([
  "BoSY",
  "MoSY",
  "EoSY",
]);

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalize(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function generateSessionCode() {
  let code = "";

  for (let i = 0; i < 6; i += 1) {
    code +=
      ALPHABET[
        crypto.randomInt(
          0,
          ALPHABET.length
        )
      ];
  }

  return code;
}

async function getCurrentUser(
  request
) {
  const cookieToken =
    request.cookies.get(
      SESSION_COOKIE
    )?.value;

  const authHeader =
    request.headers.get(
      "authorization"
    ) ||
    request.headers.get(
      "x-authorization"
    );

  const token =
    cookieToken ||
    (authHeader
      ? authHeader
          .replace(
            /^Bearer\s+/i,
            ""
          )
          .trim()
      : "");

  if (!token) {
    return null;
  }

  try {
    const verified =
      await jwtVerify(
        token,
        JWT_SECRET
      );

    const userId = Number(
      verified.payload.sub
    );

    if (
      !Number.isInteger(
        userId
      )
    ) {
      return null;
    }

    return prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        username: true,
        role: true,
        fullName: true,
        section: true,
      },
    });
  } catch {
    return null;
  }
}

async function requireTeacher(
  request
) {
  const user =
    await getCurrentUser(
      request
    );

  if (!user) {
    return {
      error: json(
        {
          error:
            "Missing or invalid session.",
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
      error: json(
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
  if (
    typeof period !==
    "string"
  ) {
    return null;
  }

  const normalized =
    period.length === 4
      ? period.charAt(0).toUpperCase() +
        period
          .slice(1)
          .toLowerCase()
      : period;

  return VALID_PERIODS.has(
    normalized
  )
    ? normalized
    : null;
}

function getStagePayload(
  stage,
  currentContent,
  storyTitle
) {
  return {
    stage,
    current_content:
      currentContent || "",
    story_title:
      storyTitle || "",
  };
}

async function getOwnedLearner(
  userId,
  learnerId
) {
  const learner =
    await prisma.learner.findFirst({
      where: {
        id: learnerId,
        teacherId: userId,
      },
    });

  return learner;
}

async function getOwnedAssessment(
  userId,
  sessionId
) {
  return prisma.assessmentSession.findFirst(
    {
      where: {
        id: sessionId,
        teacherId: userId,
      },
      include: {
        metrics: true,
        letterResults: true,
        wordResults: true,
        passageMiscues: true,
        comprehensionResults: true,
        learner: true,
      },
    }
  );
}

async function ensureMetrics(
  sessionId
) {
  return prisma.sessionMetrics.upsert(
    {
      where: {
        sessionId,
      },
      create: {
        sessionId,
      },
      update: {},
    }
  );
}

async function updateClassification(
  sessionId,
  classification,
  task1Score = null,
  task2Score = null
) {
  const existing =
    await prisma.sessionMetrics.findUnique(
      {
        where: {
          sessionId,
        },
      }
    );

  await prisma.sessionMetrics.upsert(
    {
      where: {
        sessionId,
      },
      create: {
        sessionId,
        task1Score:
          task1Score ?? 0,
        task2Score:
          task2Score ?? 0,
        classificationLabel:
          classification,
      },
      update: {
        ...(task1Score !== null
          ? { task1Score }
          : {}),
        ...(task2Score !== null
          ? { task2Score }
          : {}),
        classificationLabel:
          classification,
      },
    }
  );

  await prisma.assessmentSession.update(
    {
      where: {
        id: sessionId,
      },
      data: {
        overallClassification:
          classification,
        isCompleted: true,
      },
    }
  );

  return existing;
}

export async function POST(
  request
) {
  try {
    const body =
      await request
        .json()
        .catch(() => ({}));

    const action =
      normalize(body.action).toLowerCase();

    switch (action) {
      case "host_start": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const stage =
          normalize(body.stage) ||
          "waiting";

        const currentContent =
          typeof body.currentContent ===
          "string"
            ? body.currentContent
            : "Waiting for learner to connect...";

        const storyTitle =
          typeof body.storyTitle ===
          "string"
            ? body.storyTitle
            : "";

        let createdHost = null;

        for (
          let attempt = 0;
          attempt < 10;
          attempt += 1
        ) {
          const code =
            generateSessionCode();

          try {
            createdHost =
              await prisma.hostSession.create(
                {
                  data: {
                    code,
                    teacherId:
                      auth.user.id,
                    stage,
                    currentContent,
                    storyTitle,
                    ended: false,
                  },
                }
              );

            break;
          } catch (error) {
            if (
              error?.code !==
              "P2002"
            ) {
              throw error;
            }
          }
        }

        if (!createdHost) {
          return json(
            {
              error:
                "Unable to generate a unique assessment code.",
            },
            500
          );
        }

        return json({
          status: "ok",
          code: createdHost.code,
          session_id:
            createdHost.id,
          session:
            getStagePayload(
              createdHost.stage,
              createdHost.currentContent,
              createdHost.storyTitle
            ),
        });
      }

      case "host_update": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const code =
          normalize(body.code).toUpperCase();

        if (!code) {
          return json(
            {
              error:
                "Missing code.",
            },
            400
          );
        }

        const existingHost =
          await prisma.hostSession.findFirst(
            {
              where: {
                code,
                teacherId:
                  auth.user.id,
              },
            }
          );

        if (!existingHost) {
          return json(
            {
              error:
                "Not authorized or session not found.",
            },
            403
          );
        }

        const data = {};

        if (
          typeof body.stage ===
          "string"
        ) {
          data.stage =
            normalize(body.stage);
        }

        if (
          typeof body.currentContent ===
          "string"
        ) {
          data.currentContent =
            body.currentContent;
        }

        if (
          typeof body.storyTitle ===
          "string"
        ) {
          data.storyTitle =
            body.storyTitle;
        }

        if (
          typeof body.ended !==
          "undefined"
        ) {
          data.ended = Boolean(
            body.ended
          );
        }

        const updated =
          await prisma.hostSession.update(
            {
              where: {
                id: existingHost.id,
              },
              data,
            }
          );

        return json({
          status: "ok",
          session:
            getStagePayload(
              updated.stage,
              updated.currentContent,
              updated.storyTitle
            ),
        });
      }

      case "host_get": {
        const code =
          normalize(body.code).toUpperCase();

        if (!code) {
          return json(
            {
              error:
                "Missing code.",
            },
            400
          );
        }

        const session =
          await prisma.hostSession.findUnique(
            {
              where: {
                code,
              },
            }
          );

        if (!session) {
          return json(
            {
              status: "error",
              message:
                "Session expired or invalid.",
            },
            404
          );
        }

        if (session.ended) {
          return json({
            status: "ok",
            session: {
              ended: true,
              stage: "complete",
              current_content: "",
              story_title: "",
            },
          });
        }

        return json({
          status: "ok",
          session:
            getStagePayload(
              session.stage,
              session.currentContent,
              session.storyTitle
            ),
        });
      }

      case "host_join": {
        const code =
          normalize(body.code).toUpperCase();

        if (!code) {
          return json(
            {
              error:
                "Missing code.",
            },
            400
          );
        }

        const claim =
          await prisma.hostSession.updateMany(
            {
              where: {
                code,
                ended: false,
                stage: "waiting",
              },
              data: {
                stage: "linked",
              },
            }
          );

        if (claim.count !== 1) {
          const existing =
            await prisma.hostSession.findUnique(
              {
                where: {
                  code,
                },
              }
            );

          if (
            !existing ||
            existing.ended
          ) {
            return json(
              {
                status: "error",
                message:
                  "Invalid or expired session code.",
              },
              404
            );
          }

          return json(
            {
              status: "error",
              message:
                "This session code is already in use or expired. Each learner needs a unique code.",
            },
            409
          );
        }

        const session =
          await prisma.hostSession.findUnique(
            {
              where: {
                code,
              },
            }
          );

        return json({
          status: "ok",
          session: {
            stage: "linked",
            current_content:
              session?.currentContent ||
              "",
            story_title:
              session?.storyTitle ||
              "",
            ended: false,
          },
        });
      }

      case "host_end": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const code =
          normalize(body.code).toUpperCase();

        if (!code) {
          return json(
            {
              error:
                "Missing code.",
            },
            400
          );
        }

        const updated =
          await prisma.hostSession.updateMany(
            {
              where: {
                code,
                teacherId:
                  auth.user.id,
                ended: false,
              },
              data: {
                ended: true,
                stage: "complete",
              },
            }
          );

        if (updated.count !== 1) {
          return json(
            {
              error:
                "Not authorized or session not found.",
            },
            403
          );
        }

        return json({
          status: "ok",
        });
      }

      case "start_session": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const learnerId =
          Number(body.learner_id);

        const period =
          normalizePeriod(
            body.period
          );

        if (
          !Number.isInteger(
            learnerId
          ) ||
          !period
        ) {
          return json(
            {
              error:
                "Invalid learner or assessment period.",
            },
            400
          );
        }

        const learner =
          await getOwnedLearner(
            auth.user.id,
            learnerId
          );

        if (!learner) {
          return json(
            {
              error:
                "Not authorized to assess this learner.",
            },
            403
          );
        }

        const session =
          await prisma.assessmentSession.upsert(
            {
              where: {
                unique_period: {
                  learnerId,
                  assessmentPeriod:
                    period,
                },
              },
              create: {
                learnerId,
                teacherId:
                  auth.user.id,
                assessmentPeriod:
                  period,
                dateAdministered:
                  new Date(),
                isCompleted: false,
              },
              update: {
                teacherId:
                  auth.user.id,
              },
            }
          );

        await ensureMetrics(
          session.id
        );

        return json({
          session_id:
            session.id,
          period,
        });
      }

      case "record_letter": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const sessionId =
          Number(
            body.session_id
          );

        const index =
          Number(body.index);

        const letter =
          normalize(
            body.letter
          ).toUpperCase();

        const isCorrect =
          Boolean(
            body.is_correct
          );

        if (
          !Number.isInteger(
            sessionId
          ) ||
          !Number.isInteger(
            index
          ) ||
          index < 0 ||
          index >=
            LETTERS.length ||
          letter !==
            LETTERS[index]
        ) {
          return json(
            {
              error:
                "Invalid letter response.",
            },
            400
          );
        }

        const session =
          await getOwnedAssessment(
            auth.user.id,
            sessionId
          );

        if (!session) {
          return json(
            {
              error:
                "Not authorized.",
            },
            403
          );
        }

        if (session.isCompleted) {
          return json(
            {
              error:
                "Assessment session is already completed.",
            },
            409
          );
        }

        await prisma.letterTaskResult.upsert(
          {
            where: {
              sessionId_letterIndex: {
                sessionId,
                letterIndex:
                  index,
              },
            },
            create: {
              sessionId,
              letterIndex:
                index,
              letter,
              isCorrect,
            },
            update: {
              letter,
              isCorrect,
            },
          }
        );

        const results =
          await prisma.letterTaskResult.findMany(
            {
              where: {
                sessionId,
              },
            }
          );

        const task1Score =
          results.reduce(
            (sum, item) =>
              sum +
              (item.isCorrect
                ? 1
                : 0),
            0
          );

        await prisma.sessionMetrics.upsert(
          {
            where: {
              sessionId,
            },
            create: {
              sessionId,
              task1Score,
            },
            update: {
              task1Score,
            },
          }
        );

        if (
          results.length ===
            LETTERS.length &&
          task1Score === 0
        ) {
          await prisma.$transaction(
            [
              prisma.assessmentSession.update(
                {
                  where: {
                    id: sessionId,
                  },
                  data: {
                    isCompleted:
                      true,
                    overallClassification:
                      "Low Emerging Reader",
                  },
                }
              ),
              prisma.sessionMetrics.update(
                {
                  where: {
                    sessionId,
                  },
                  data: {
                    task1Score,
                    classificationLabel:
                      "Low Emerging Reader",
                  },
                }
              ),
            ]
          );

          return json({
            status:
              "terminated",
            classification:
              "Low Emerging Reader",
            task1_correct:
              task1Score,
          });
        }

        return json({
          status: "ok",
          task1_correct:
            task1Score,
          completed:
            results.length ===
            LETTERS.length,
          next_stage:
            results.length ===
            LETTERS.length
              ? "task2"
              : "task1",
        });
      }

      case "record_word": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const sessionId =
          Number(
            body.session_id
          );

        const index =
          Number(body.index);

        const word =
          normalize(
            body.word
          ).toLowerCase();

        const isCorrect =
          Boolean(
            body.is_correct
          );

        if (
          !Number.isInteger(
            sessionId
          ) ||
          !Number.isInteger(
            index
          ) ||
          index < 0 ||
          index >=
            WORDS.length ||
          word !== WORDS[index]
        ) {
          return json(
            {
              error:
                "Invalid word response.",
            },
            400
          );
        }

        const session =
          await getOwnedAssessment(
            auth.user.id,
            sessionId
          );

        if (!session) {
          return json(
            {
              error:
                "Not authorized.",
            },
            403
          );
        }

        if (session.isCompleted) {
          return json(
            {
              error:
                "Assessment session is already completed.",
            },
            409
          );
        }

        await prisma.wordTaskResult.upsert(
          {
            where: {
              sessionId_wordIndex: {
                sessionId,
                wordIndex:
                  index,
              },
            },
            create: {
              sessionId,
              wordIndex:
                index,
              word,
              isCorrect,
            },
            update: {
              word,
              isCorrect,
            },
          }
        );

        const wordResults =
          await prisma.wordTaskResult.findMany(
            {
              where: {
                sessionId,
              },
            }
          );

        const letterResults =
          await prisma.letterTaskResult.findMany(
            {
              where: {
                sessionId,
              },
            }
          );

        const task1Score =
          letterResults.reduce(
            (sum, item) =>
              sum +
              (item.isCorrect
                ? 1
                : 0),
            0
          );

        const task2Score =
          wordResults.reduce(
            (sum, item) =>
              sum +
              (item.isCorrect
                ? 1
                : 0),
            0
          );

        await prisma.sessionMetrics.upsert(
          {
            where: {
              sessionId,
            },
            create: {
              sessionId,
              task1Score,
              task2Score,
            },
            update: {
              task1Score,
              task2Score,
            },
          }
        );

        if (
          wordResults.length ===
          WORDS.length
        ) {
          const combined =
            task1Score +
            task2Score;

          if (combined <= 10) {
            await prisma.$transaction(
              [
                prisma.assessmentSession.update(
                  {
                    where: {
                      id: sessionId,
                    },
                    data: {
                      isCompleted:
                        true,
                      overallClassification:
                        "Low Emerging Reader / Moderate Refresher",
                    },
                  }
                ),
                prisma.sessionMetrics.update(
                  {
                    where: {
                      sessionId,
                    },
                    data: {
                      task1Score,
                      task2Score,
                      classificationLabel:
                        "Low Emerging Reader / Moderate Refresher",
                    },
                  }
                ),
              ]
            );

            return json({
              status:
                "terminated",
              classification:
                "Low Emerging Reader / Moderate Refresher",
              task1_correct:
                task1Score,
              task2_correct:
                task2Score,
              combined,
            });
          }

          return json({
            status: "ok",
            task1_correct:
              task1Score,
            task2_correct:
              task2Score,
            combined,
            completed: true,
            next_stage:
              "part2",
          });
        }

        return json({
          status: "ok",
          task1_correct:
            task1Score,
          task2_correct:
            task2Score,
          completed: false,
          next_stage:
            "task2",
        });
      }

      case "record_miscue": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const sessionId =
          Number(
            body.session_id
          );

        const wordIndex =
          Number(
            body.word_index
          );

        const miscueType =
          normalize(
            body.miscue_type
          );

        const misreadWord =
          normalize(
            body.misread_word
          );

        const allowedTypes =
          new Set([
            "Insertion",
            "Omission",
            "Substitution",
            "Repetition",
            "Self-Correction",
          ]);

        if (
          !Number.isInteger(
            sessionId
          ) ||
          !Number.isInteger(
            wordIndex
          ) ||
          !allowedTypes.has(
            miscueType
          )
        ) {
          return json(
            {
              error:
                "Invalid miscue record.",
            },
            400
          );
        }

        const session =
          await getOwnedAssessment(
            auth.user.id,
            sessionId
          );

        if (!session) {
          return json(
            {
              error:
                "Not authorized.",
            },
            403
          );
        }

        await prisma.passageMiscue.create(
          {
            data: {
              sessionId,
              wordIndex,
              miscueType,
              misreadWord:
                misreadWord ||
                null,
            },
          }
        );

        return json({
          status: "ok",
        });
      }

      case "record_comprehension": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const sessionId =
          Number(
            body.session_id
          );

        if (
          !Number.isInteger(
            sessionId
          )
        ) {
          return json(
            {
              error:
                "Invalid session ID.",
            },
            400
          );
        }

        const session =
          await getOwnedAssessment(
            auth.user.id,
            sessionId
          );

        if (!session) {
          return json(
            {
              error:
                "Not authorized.",
            },
            403
          );
        }

        const answers =
          Array.isArray(
            body.answers
          )
            ? body.answers
            : [];

        for (
          const answer of answers
        ) {
          const questionIndex =
            Number(
              answer.question_index
            );

          if (
            !Number.isInteger(
              questionIndex
            )
          ) {
            continue;
          }

          await prisma.comprehensionResult.upsert(
            {
              where: {
                sessionId_questionIndex:
                  {
                    sessionId,
                    questionIndex,
                  },
              },
              create: {
                sessionId,
                questionIndex,
                isCorrect:
                  Boolean(
                    answer.is_correct
                  ),
              },
              update: {
                isCorrect:
                  Boolean(
                    answer.is_correct
                  ),
              },
            }
          );
        }

        return json({
          status: "ok",
        });
      }

      case "finalize_session": {
        const auth =
          await requireTeacher(
            request
          );

        if (auth.error) {
          return auth.error;
        }

        const sessionId =
          Number(
            body.session_id
          );

        const timerSeconds =
          body.timer_seconds ===
            null ||
          typeof body.timer_seconds ===
            "undefined"
            ? null
            : Number(
                body.timer_seconds
              );

        const session =
          await getOwnedAssessment(
            auth.user.id,
            sessionId
          );

        if (!session) {
          return json(
            {
              error:
                "Not authorized.",
            },
            403
          );
        }

        const miscueCount =
          await prisma.passageMiscue.count(
            {
              where: {
                sessionId,
              },
            }
          );

        const comprehensionResults =
          await prisma.comprehensionResult.findMany(
            {
              where: {
                sessionId,
              },
            }
          );

        const comprehensionScore =
          comprehensionResults.reduce(
            (sum, result) =>
              sum +
              (result.isCorrect
                ? 1
                : 0),
            0
          );

        const accuracy = Math.max(
          0,
          100 - miscueCount
        );

        let classification =
          "Undetermined";

        if (accuracy <= 25) {
          classification =
            "High Emerging Reader";
        } else if (
          accuracy <= 50
        ) {
          classification =
            comprehensionScore ===
            0
              ? "High Emerging Reader"
              : "Developing Reader";
        } else if (
          accuracy <= 75
        ) {
          classification =
            comprehensionScore <=
            2
              ? "Developing Reader"
              : "Transitioning Reader";
        } else if (
          accuracy <= 100
        ) {
          classification =
            comprehensionScore <=
            4
              ? "Transitioning Reader"
              : "Reading at Grade Level";
        }

        await prisma.$transaction(
          [
            prisma.assessmentSession.update(
              {
                where: {
                  id: sessionId,
                },
                data: {
                  isCompleted:
                    true,
                  overallClassification:
                    classification,
                },
              }
            ),
            prisma.sessionMetrics.upsert(
              {
                where: {
                  sessionId,
                },
                create: {
                  sessionId,
                  task1Score:
                    session.metrics
                      ?.task1Score ||
                    0,
                  task2Score:
                    session.metrics
                      ?.task2Score ||
                    0,
                  totalMiscues:
                    miscueCount,
                  miscueAccuracy:
                    accuracy,
                  comprehensionScore,
                  timerSeconds:
                    Number.isFinite(
                      timerSeconds
                    )
                      ? timerSeconds
                      : null,
                  classificationLabel:
                    classification,
                },
                update: {
                  totalMiscues:
                    miscueCount,
                  miscueAccuracy:
                    accuracy,
                  comprehensionScore,
                  timerSeconds:
                    Number.isFinite(
                      timerSeconds
                    )
                      ? timerSeconds
                      : null,
                  classificationLabel:
                    classification,
                },
              }
            ),
          ]
        );

        return json({
          status:
            "finalized",
          classification,
          accuracy,
          comp_score:
            comprehensionScore,
        });
      }

      default:
        return json(
          {
            error:
              "Invalid assessment action endpoint.",
          },
          404
        );
    }
  } catch (error) {
    console.error(
      "CRL-App assessment API error:",
      error
    );

    return json(
      {
        error:
          "Internal server error.",
      },
      500
    );
  }
}
