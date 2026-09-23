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

    const type = clean(body?.type, 20).toLowerCase();
    if (type !== BUG && type !== FEEDBACK) {
      return jsonResponse({ error: "Unknown submission type." }, 400);
    }

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

    if (type === BUG) {
      await prisma.bugReport.create({
        data: { name, contact, message, pageUrl, userAgent },
      });
      return jsonResponse({ status: "ok", message: "Bug report received." }, 201);
    }

    await prisma.feedback.create({
      data: { name, contact, message, pageUrl, userAgent },
    });
    return jsonResponse({ status: "ok", message: "Feedback received." }, 201);
  } catch (error) {
    console.error("Public report error:", error);
    return jsonResponse({ error: "Unable to send right now. Please try again." }, 500);
  }
}
