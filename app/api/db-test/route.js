import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function responseJson(data, status = 200) {
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

/*
 * CRL-App database health endpoint.
 *
 * This route is intentionally lightweight and safe to expose in production.
 * It verifies:
 *   1. Prisma can connect to the configured database.
 *   2. A real SQL query succeeds.
 *   3. A real Prisma model query succeeds.
 *
 * It does NOT expose learner names, account details, passwords, tokens,
 * or complete table contents.
 */

export async function GET() {
  const startedAt = Date.now();

  try {
    if (!process.env.DATABASE_URL) {
      return responseJson(
        {
          status: "error",
          database: "not_configured",
          message:
            "DATABASE_URL is not configured on the server.",
        },
        503
      );
    }

    // Low-level PostgreSQL connectivity test.
    await prisma.$queryRaw`SELECT 1`;

    // ORM-level connectivity test using an actual CRL-App model.
    const userCount = await prisma.user.count();

    const latencyMs = Date.now() - startedAt;

    return responseJson({
      status: "ok",
      database: "connected",
      databaseType: "PostgreSQL",
      orm: "Prisma",
      latencyMs,
      checks: {
        sql: true,
        prisma: true,
      },

      /*
       * Useful for confirming that Prisma can query the application's
       * database without exposing any actual user records.
       */
      applicationDatabaseReady: true,

      /*
       * Kept only as a diagnostic number. No user data is returned.
       */
      userRecords: userCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("CRL-App database health check failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Unknown database error.";

    return responseJson(
      {
        status: "error",
        database: "disconnected",
        databaseType: "PostgreSQL",
        orm: "Prisma",
        applicationDatabaseReady: false,
        message,
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
}

export async function HEAD() {
  try {
    if (!process.env.DATABASE_URL) {
      return new NextResponse(null, {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    await prisma.$queryRaw`SELECT 1`;

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("CRL-App database HEAD check failed:", error);

    return new NextResponse(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
