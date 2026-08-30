import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    // Basic database connectivity test.
    await prisma.$queryRaw`SELECT 1`;

    // Confirm that the CRL-App tables can actually be queried.
    const [
      userCount,
      inviteCodeCount,
      learnerCount,
      assessmentSessionCount,
      hostSessionCount,
      letterResultCount,
      wordResultCount,
      passageMiscueCount,
      comprehensionResultCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.inviteCode.count(),
      prisma.learner.count(),
      prisma.assessmentSession.count(),
      prisma.hostSession.count(),
      prisma.letterTaskResult.count(),
      prisma.wordTaskResult.count(),
      prisma.passageMiscue.count(),
      prisma.comprehensionResult.count(),
    ]);

    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        databaseType: "PostgreSQL",
        message:
          "CRL-App successfully connected to the Supabase PostgreSQL database.",
        tables: {
          users: userCount,
          invite_codes: inviteCodeCount,
          learners: learnerCount,
          assessment_sessions:
            assessmentSessionCount,
          host_sessions: hostSessionCount,
          letter_task_results:
            letterResultCount,
          word_task_results:
            wordResultCount,
          passage_miscues:
            passageMiscueCount,
          comprehension_results:
            comprehensionResultCount,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "CRL-App database connection test failed:",
      error
    );

    return NextResponse.json(
      {
        status: "error",
        database: "connection_failed",
        message:
          "CRL-App could not connect to the database or query one of its tables.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
