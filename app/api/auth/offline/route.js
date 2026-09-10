import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTH_COOKIE_NAME = "crla_token";
const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
const OFFLINE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

function verifyCurrentToken(token) {
  if (!token || !JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function createOfflineToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET or AUTH_SECRET is not configured.");
  return jwt.sign(
    {
      id: Number(user.id),
      username: user.username,
      role: user.role,
      type: "teacher_offline_session",
    },
    JWT_SECRET,
    { expiresIn: `${OFFLINE_SESSION_MAX_AGE_SECONDS}s` }
  );
}

export async function GET(request) {
  try {
    const currentToken = request.cookies.get(AUTH_COOKIE_NAME)?.value || "";
    const decoded = verifyCurrentToken(currentToken);
    const userId = Number(decoded?.id ?? decoded?.sub ?? 0);

    if (!Number.isInteger(userId) || userId <= 0) {
      return jsonResponse({ error: "A current authenticated teacher session is required." }, 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        section: true,
        email: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
      },
    });

    if (!user || !["teacher", "admin"].includes(String(user.role).toLowerCase())) {
      return jsonResponse({ error: "Teacher account not found." }, 403);
    }

    const offlineToken = createOfflineToken(user);

    return jsonResponse({
      status: "ok",
      offlineToken,
      expiresAt: Date.now() + OFFLINE_SESSION_MAX_AGE_SECONDS * 1000,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        section: user.section || "",
        email: user.email || "",
        email_verified: Boolean(user.emailVerifiedAt),
        two_factor_enabled: Boolean(user.twoFactorEnabled),
      },
    });
  } catch (error) {
    console.error("Offline session bootstrap error:", error);
    return jsonResponse({ error: "Unable to prepare offline teacher access." }, 500);
  }
}
