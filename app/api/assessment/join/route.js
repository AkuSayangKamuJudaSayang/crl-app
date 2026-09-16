import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_VERSION = "2026-09-03-learner-join-v1";

const LETTERS = [
  "M", "S", "A", "L", "O",
  "B", "E", "U", "R", "T",
];

function normalizeCode(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 6);
}

function json(data, status = 200, request) {
  const origin = request?.headers?.get("origin");
  const headers = {
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "X-CRL-API-Version": API_VERSION,
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept",
    "Vary": "Origin",
  };

  // Learner join is intentionally public and carries no credentialed cookie.
  headers["Access-Control-Allow-Origin"] =
    origin || "*";

  return NextResponse.json(data, {
    status,
    headers,
  });
}

export async function OPTIONS(request) {
  return json({ status: "ok" }, 204, request);
}

export async function POST(request) {
  let body = {};

  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Invalid request body." },
      400,
      request
    );
  }

  const code = normalizeCode(body?.code);

  if (code.length !== 6) {
    return json(
      { error: "Please enter the 6-character assessment code." },
      400,
      request
    );
  }

  try {
    // Small public lookup. Do not pull teacher or scoring records here.
    const host = await prisma.hostSession.findUnique({
      where: { code },
      select: {
        id: true,
        learnerId: true,
        stage: true,
        currentContent: true,
        storyTitle: true,
        ended: true,
        linkedAt: true,
        assessmentSession: {
          select: {
            isCompleted: true,
            assessmentPeriod: true,
          },
        },
        learner: {
          select: {
            id: true,
            lrn: true,
            firstName: true,
            middleName: true,
            lastName: true,
            suffix: true,
            sex: true,
            gradeLevel: true,
            section: true,
          },
        },
      },
    });

    if (!host) {
      return json(
        { error: "Assessment code is invalid or no longer exists." },
        404,
        request
      );
    }

    if (
      host.ended ||
      host.assessmentSession?.isCompleted
    ) {
      return json(
        { error: "This assessment session has already ended." },
        410,
        request
      );
    }

    if (!host.learnerId || !host.learner) {
      return json(
        { error: "No learner has been assigned to this assessment." },
        409,
        request
      );
    }

    if (host.linkedAt) {
      return json(
        {
          error:
            "This assessment code is already connected to a learner device.",
        },
        409,
        request
      );
    }

    // Claim the host session atomically. This prevents a double connection.
    const claim = await prisma.hostSession.updateMany({
      where: {
        id: host.id,
        ended: false,
        linkedAt: null,
      },
      data: {
        linkedAt: new Date(),
      },
    });

    if (claim.count !== 1) {
      return json(
        {
          error:
            "This assessment code is already connected to a learner device.",
        },
        409,
        request
      );
    }

    /*
     * Preserve the teacher's current stage, but make sure Task 1 has a real
     * first item. The teacher's start screen parks the host in the "letter"
     * stage holding placeholder text ("Waiting for learner to connect..."), so
     * checking only for waiting/connected left that placeholder in place.
     * Every letter advance is a compare-and-set against the current item, so
     * each one then failed its expectation, was reported stale and ignored,
     * and the learner - which reads the host - never saw a single letter.
     */
    const currentContent = String(host.currentContent || "").trim();
    const holdsRealLetter = /^[A-Za-z]$/.test(currentContent);

    let effectiveStage = host.stage;
    if (
      host.stage === "waiting" ||
      host.stage === "connected" ||
      (host.stage === "letter" && !holdsRealLetter)
    ) {
      effectiveStage = "letter";

      await prisma.hostSession.update({
        where: { id: host.id },
        data: {
          stage: "letter",
          /*
           * Keep a genuine in-progress letter so a reconnecting learner does
           * not restart Task 1, otherwise seed the first letter. Note this
           * must fall back to LETTERS[0] - repeating host.currentContent here
           * would simply write the same placeholder back and change nothing.
           */
          currentContent:
            holdsRealLetter ? currentContent : LETTERS[0],
        },
      });
    }

    return json(
      {
        status: "ok",
        connected: true,
        ended: false,
        stage: effectiveStage,
        current_content:
          host.currentContent || LETTERS[0],
        story_title: host.storyTitle,
        learner: {
          id: host.learner.id,
          learner_id: host.learner.id,
          lrn: host.learner.lrn,
          first_name: host.learner.firstName,
          middle_name: host.learner.middleName,
          last_name: host.learner.lastName,
          suffix: host.learner.suffix,
          sex: host.learner.sex,
          grade_level: host.learner.gradeLevel,
          section: host.learner.section,
        },
        period:
          host.assessmentSession?.assessmentPeriod || null,
      },
      200,
      request
    );
  } catch (error) {
    console.error("Learner join endpoint error:", error);

    return json(
      {
        error:
          "Unable to connect to the assessment server. Please try again.",
      },
      503,
      request
    );
  }
}
