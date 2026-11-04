import {getAuthenticatedUser} from '../../../../lib/auth';
import { logSecureError } from "../../../../lib/security";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function createOfflineToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET or AUTH_SECRET is not configured.");
  return jwt.sign(
    {
      id: Number(user.id),
      username: user.username,
      role: user.role,
      scope: "app",
      session_version: user.adminSessionVersion,
      type: "teacher_offline_session",
    },
    JWT_SECRET,
    { expiresIn: `${OFFLINE_SESSION_MAX_AGE_SECONDS}s` }
  );
}

export async function GET(request) {
  try {
    const user=await getAuthenticatedUser(request);
    if(!user)return jsonResponse({error:'A current authenticated teacher session is required.'},401);
    const profile=await prisma.user.findUnique({where:{id:Number(user.id)}});
    if(!profile?.isActive||profile.role!=='teacher'||profile.adminSessionVersion!==user.adminSessionVersion)return jsonResponse({error:'Teacher account not found.'},403);
    const offlineToken = createOfflineToken(profile);

    return jsonResponse({
      status: "ok",
      offlineToken,
      expiresAt: Date.now() + OFFLINE_SESSION_MAX_AGE_SECONDS * 1000,
      user: {
        id: user.id,
        username: user.username,
        full_name: profile.fullName,
        role: user.role,
        section: profile.section || "",
        school_id: user.schoolId || "",
        school_name: profile.schoolName || "",
        email: profile.email || "",
        email_verified: Boolean(profile.emailVerifiedAt),
        two_factor_enabled: Boolean(profile.twoFactorEnabled),
      },
    });
  } catch (error) {
    logSecureError('Offline session bootstrap error:', typeof error !== "undefined" ? error : null);
    return jsonResponse({ error: "Unable to prepare offline teacher access." }, 500);
  }
}
