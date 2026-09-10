import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET ||
  "";

const PASSAGE_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

const COMPREHENSION_COUNT = 6;
const VALID_MISCUE_TYPES = [
  "Insertion",
  "Omission",
  "Substitution",
  "Repetition",
  "SelfCorrection",
];

function responseJson(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "X-CRL-API-Version": "2026-09-10-offline-commit-v1",
    },
  });
}

function getTokenFromRequest(request) {
  const cookieToken = request.cookies.get("crla_token")?.value;
  if (cookieToken) return cookieToken;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.substring(7);
  }

  return null;
}

async function requireTeacher(request) {
  const token = getTokenFromRequest(request);

  if (!token || !JWT_SECRET) {
    return null;
  }

  try {
    const verified = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );

    const role = String(verified.payload.role || "").toLowerCase();
    const userId = Number(
      verified.payload.id ?? verified.payload.sub ?? 0
    );

    if (
      (role !== "teacher" && role !== "admin") ||
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return null;
    }

    return userId;
  } catch {
    return null;
  }
}

function calculatePart2Classification(readingAccuracy, comprehensionScore) {
  const accuracy = Number(readingAccuracy || 0);
  const comprehension = Number(comprehensionScore || 0);

  if (accuracy <= 25) return "High Emerging Reader";

  if (accuracy <= 50) {
    return comprehension === 0
      ? "High Emerging Reader"
      : "Developing Reader";
  }

  if (accuracy <= 75) {
    return comprehension <= 2
      ? "Developing Reader"
      : "Transitioning Reader";
  }

  return comprehension <= 4
    ? "Transitioning Reader"
    : "Reading at Grade Level";
}

function calculatePart1Classification(task1Score, task2Score) {
  const total = Number(task1Score || 0) + Number(task2Score || 0);

  if (total <= 10) return "Low Emerging Reader";
  return "High Emerging Reader";
}

export async function POST(request) {
  const teacherId = await requireTeacher(request);
  if (!teacherId) {
    return responseJson({ error: "Authentication required." }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const code = String(body?.code || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();

  const remarks = String(body?.remarks ?? "").trim();

  if (!code) {
    return responseJson({ error: "Assessment code is required." }, 400);
  }

  if (remarks.length > 5000) {
    return responseJson(
      { error: "Remarks must be 5,000 characters or fewer." },
      400
    );
  }

  const rawMiscues = Array.isArray(body?.miscues) ? body.miscues : [];
  const rawComprehension = Array.isArray(body?.comprehension)
    ? body.comprehension
    : [];

  const timerSeconds = Math.min(
    120,
    Math.max(0, Number(body?.timer_seconds ?? body?.timerSeconds ?? 0))
  );
  const wordsRead = Math.min(
    100,
    Math.max(0, Number(body?.words_read ?? body?.wordsRead ?? 100))
  );

  if (
    !Number.isInteger(timerSeconds) ||
    !Number.isInteger(wordsRead)
  ) {
    return responseJson(
      { error: "Timer and words-read values must be whole numbers." },
      400
    );
  }

  const userMiscues = [];
  const seenMiscueWords = new Set();

  for (const item of rawMiscues.slice(0, 100)) {
    const wordIndex = Number(item?.wordIndex ?? item?.word_index);
    const miscueType = String(
      item?.miscueType ?? item?.miscue_type ?? ""
    ).trim();
    const misreadWord = String(
      item?.misreadWord ?? item?.misread_word ?? ""
    ).trim();

    if (
      Number.isInteger(wordIndex) &&
      wordIndex >= 0 &&
      wordIndex < 100 &&
      VALID_MISCUE_TYPES.includes(miscueType) &&
      !seenMiscueWords.has(wordIndex)
    ) {
      seenMiscueWords.add(wordIndex);
      userMiscues.push({
        wordIndex,
        miscueType,
        misreadWord: misreadWord || null,
      });
    }
  }

  for (let index = wordsRead; index < 100; index += 1) {
    if (!seenMiscueWords.has(index)) {
      userMiscues.push({
        wordIndex: index,
        miscueType: "Omission",
        misreadWord: null,
      });
    }
  }

  const comprehension = [];
  const seenQuestions = new Set();

  for (const item of rawComprehension.slice(0, COMPREHENSION_COUNT)) {
    const questionIndex = Number(
      item?.questionIndex ?? item?.question_index
    );

    if (
      Number.isInteger(questionIndex) &&
      questionIndex >= 0 &&
      questionIndex < COMPREHENSION_COUNT &&
      !seenQuestions.has(questionIndex)
    ) {
      seenQuestions.add(questionIndex);
      comprehension.push({
        questionIndex,
        isCorrect: Boolean(item?.isCorrect ?? item?.is_correct),
      });
    }
  }

  if (comprehension.length !== COMPREHENSION_COUNT) {
    return responseJson(
      { error: "All comprehension questions must be answered before saving the assessment." },
      409
    );
  }

  try {
    const host = await prisma.hostSession.findFirst({
      where: {
        code,
        teacherId,
      },
      include: {
        assessmentSession: {
          include: {
            letterResults: true,
            wordResults: true,
            sessionMetrics: true,
          },
        },
      },
    });

    if (!host || !host.assessmentSessionId || !host.assessmentSession) {
      return responseJson({ error: "Assessment session not found." }, 404);
    }

    if (host.assessmentSession.isCompleted) {
      return responseJson({
        status: "ok",
        saved: true,
        completed: true,
        remarks: host.assessmentSession.sessionMetrics?.remarks || remarks,
        classification:
          host.assessmentSession.overallClassification ||
          host.assessmentSession.sessionMetrics?.classificationLabel ||
          "Low Emerging Reader",
      });
    }

    if (host.stage !== "comprehension") {
      return responseJson(
        { error: "The assessment is not ready for final saving." },
        409
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const letters = await tx.letterTaskResult.findMany({
        where: { sessionId: host.assessmentSessionId },
      });
      const words = await tx.wordTaskResult.findMany({
        where: { sessionId: host.assessmentSessionId },
      });

      const task1Score = letters.filter((item) => item.isCorrect).length;
      const task2Score = words.filter((item) => item.isCorrect).length;

      await tx.passageMiscue.deleteMany({
        where: { sessionId: host.assessmentSessionId },
      });
      await tx.comprehensionResult.deleteMany({
        where: { sessionId: host.assessmentSessionId },
      });

      if (userMiscues.length) {
        await tx.passageMiscue.createMany({
          data: userMiscues.map((item) => ({
            sessionId: host.assessmentSessionId,
            wordIndex: item.wordIndex,
            miscueType: item.miscueType,
            misreadWord: item.misreadWord,
          })),
        });
      }

      await tx.comprehensionResult.createMany({
        data: comprehension.map((item) => ({
          sessionId: host.assessmentSessionId,
          questionIndex: item.questionIndex,
          isCorrect: item.isCorrect,
        })),
      });

      const totalMiscues = userMiscues.length;
      const passageWordCount = PASSAGE_TEXT.trim().split(/\s+/).filter(Boolean).length;
      const actualWordsRead = Math.max(0, passageWordCount - totalMiscues);
      const miscueAccuracy = Number(actualWordsRead.toFixed(2));
      const comprehensionScore = comprehension.filter(
        (item) => item.isCorrect
      ).length;
      const wpm = timerSeconds > 0
        ? Number(((actualWordsRead / timerSeconds) * 60).toFixed(2))
        : null;

      const classification =
        task1Score + task2Score <= 10
          ? calculatePart1Classification(task1Score, task2Score)
          : calculatePart2Classification(
              miscueAccuracy,
              comprehensionScore
            );

      const metrics = await tx.sessionMetrics.upsert({
        where: { sessionId: host.assessmentSessionId },
        update: {
          task1Score,
          task2Score,
          totalMiscues,
          miscueAccuracy,
          comprehensionScore,
          timerSeconds,
          classificationLabel: classification,
          remarks,
        },
        create: {
          sessionId: host.assessmentSessionId,
          task1Score,
          task2Score,
          totalMiscues,
          miscueAccuracy,
          comprehensionScore,
          timerSeconds,
          classificationLabel: classification,
          remarks,
        },
      });

      const assessment = await tx.assessmentSession.update({
        where: { id: host.assessmentSessionId },
        data: {
          isCompleted: true,
          overallClassification: classification,
        },
      });

      await tx.hostSession.update({
        where: { id: host.id },
        data: {
          ended: true,
          stage: "completed",
          currentContent: "Assessment completed.",
          linkedAt: new Date(),
        },
      });

      return { assessment, metrics, totalMiscues, actualWordsRead, wpm };
    });

    return responseJson({
      status: "ok",
      saved: true,
      completed: true,
      remarks: result.metrics.remarks || "",
      classification:
        result.assessment.overallClassification ||
        result.metrics.classificationLabel ||
        "Low Emerging Reader",
      scoring: {
        task1Score: result.metrics.task1Score,
        task2Score: result.metrics.task2Score,
        totalMiscues: result.totalMiscues,
        comprehensionScore: result.metrics.comprehensionScore,
        wordsRead: result.actualWordsRead,
        wpm: result.wpm,
      },
    });
  } catch (error) {
    console.error("commit_passage_assessment error:", error);
    return responseJson(
      { error: "Unable to commit the assessment draft." },
      500
    );
  }
}
