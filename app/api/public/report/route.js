import { createHash } from "node:crypto";
import {getAuthenticatedUser} from '../../../../lib/auth';
import {getCoordinatorUser} from '../../../../lib/portalAuth';
import { enforceSensitiveRate } from "../../../../lib/security";
import { logSecureError } from "../../../../lib/security";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUG = "bug";
const FEEDBACK = "feedback";
const MAX_MESSAGE = 4000;
const MAX_SHORT = 180;
const MAX_URL = 500;

function jsonResponse(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function clean(value, limit) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, limit);
}

/* Very small in-memory throttle: one submission per IP per 20 seconds. */
const recentSubmissions = new Map();
const THROTTLE_MS = 20_000;

function isThrottled(key) {
  const now = Date.now();
  const last = recentSubmissions.get(key);
  if (last && now - last < THROTTLE_MS) return true;
  recentSubmissions.set(key, now);

  if (recentSubmissions.size > 500) {
    for (const [entryKey, timestamp] of recentSubmissions) {
      if (now - timestamp > THROTTLE_MS) recentSubmissions.delete(entryKey);
    }
  }

  return false;
}

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const account=await getAuthenticatedUser(request)||await getCoordinatorUser(request);
    const schoolId=account?.schoolId||null;
    const type = clean(body?.type, 20).toLowerCase();
    if (type !== BUG && type !== FEEDBACK) {
      return jsonResponse({ error: "Unknown submission type." }, 400);
    }

    const submissionId = body?.teacher_submission_id;
    let receiptKey;
    if (submissionId !== undefined) {
      if (account?.role !== "teacher" || !schoolId) {
        return jsonResponse({ error: "Teacher sign-in is required." }, 401);
      }
      if (typeof submissionId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(submissionId)) {
        return jsonResponse({ error: "Invalid submission reference." }, 400);
      }
      const keyHash = createHash("sha256").update(`${schoolId}:${account.id}:${submissionId}`).digest("base64url");
      receiptKey = `report:${keyHash}`;
      if (await prisma.systemState.findUnique({ where: { key: receiptKey } })) {
        return jsonResponse({ status: "ok", duplicate: true });
      }
    }

    const limited = await enforceSensitiveRate(request, "public_report", body);
    if (limited) return limited;
    const message = clean(body?.message, MAX_MESSAGE);
    if (!message) {
      return jsonResponse(
        { error: type === BUG ? "Please describe the bug." : "Please enter your feedback." },
        400
      );
    }

    const name = clean(body?.name, MAX_SHORT);
    const contact = clean(body?.contact, MAX_SHORT);
    const pageUrl = clean(body?.pageUrl, MAX_URL);
    const userAgent = clean(request.headers.get("user-agent"), MAX_SHORT);

    const forwardedFor = request.headers.get("x-forwarded-for") || "";
    const ip = forwardedFor.split(",")[0].trim() || "unknown";
    if (isThrottled(ip)) {
      return jsonResponse({ error: "Please wait a moment before sending again." }, 429);
    }

    const submission = { schoolId, name, contact, message, pageUrl, userAgent };
    const save = db => type === BUG ? db.bugReport.create({ data: submission }) : db.feedback.create({ data: submission });
    if (receiptKey) {
      // A lost HTTP response can cause a retry from the offline outbox.
      // Commit the receipt with the report so that retry cannot duplicate it.
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${receiptKey}))::text AS locked`;
        if (await tx.systemState.findUnique({ where: { key: receiptKey } })) return;
        await save(tx);
        await tx.systemState.create({ data: { key: receiptKey, value: "received" } });
      });
    } else {
      await save(prisma);
    }
    return jsonResponse({ status: "ok", message: type === BUG ? "Bug report received." : "Feedback received." }, 201);
  } catch (error) {
    logSecureError('Public report error:', typeof error !== "undefined" ? error : null);
    return jsonResponse({ error: "Unable to send right now. Please try again." }, 500);
  }
}
