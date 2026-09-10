import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTH_COOKIE_NAME = "crla_token";
const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";

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

function createToken(user) {
  if (!JWT_SECRET) throw new Error("JWT secret is not configured.");
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(response, token) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.fullName,
    role: user.role,
    section: user.section || "",
    email: user.email || "",
    email_verified: Boolean(user.emailVerifiedAt),
    two_factor_enabled: Boolean(user.twoFactorEnabled),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const inviteCode = String(body?.invite_code ?? body?.inviteCode ?? "").trim().toUpperCase();
    const fullName = String(body?.full_name ?? body?.fullName ?? "").trim();
    const section = String(body?.section ?? "").trim();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!inviteCode || !fullName || !section || !username || !password) {
      return jsonResponse({ error: "Please complete all required fields." }, 400);
    }

    if (!/^[a-z0-9_.-]{3,50}$/i.test(username)) {
      return jsonResponse({ error: "Username must be 3-50 characters and use only letters, numbers, dot, underscore, or hyphen." }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ error: "Password must contain at least 6 characters." }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUser) {
      return jsonResponse({ error: "That username is already in use." }, 409);
    }

    const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
    if (!invite) return jsonResponse({ error: "Invalid admin invite code." }, 400);
    if (invite.isUsed) return jsonResponse({ error: "This invite code has already been used." }, 400);
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return jsonResponse({ error: "This invite code has expired." }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          passwordHash,
          fullName,
          section,
          email: null,
          role: "teacher",
        },
      });
      await tx.inviteCode.update({ where: { id: invite.id }, data: { isUsed: true } });
      return created;
    });

    const token = createToken(user);
    const response = jsonResponse({
      status: "ok",
      message: "Account created successfully.",
      user: serializeUser(user),
    });
    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error("Email-free signup error:", error);
    if (error?.code === "P2002") {
      return jsonResponse({ error: "That username is already in use." }, 409);
    }
    return jsonResponse({ error: "Unable to create the teacher account." }, 500);
  }
}
