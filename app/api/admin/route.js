import { NextResponse } from "next/server";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * The administrator console has its own session cookie, separate from the
 * teacher/learner app cookie. Reading only this cookie means an ordinary app
 * session — even one belonging to an administrator account — cannot reach the
 * admin API, and the admin session is never created implicitly by the app.
 */
const AUTH_COOKIE_NAME = "crla_admin_token";
const ADMIN_SESSION_SCOPE = "admin";
const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_GROUP_LENGTH = 4;
const DEFAULT_HISTORY_LIMIT = 24;

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

function getAuthToken(request) {
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }

  return null;
}

function verifyToken(token) {
  if (!token || !JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function requireAdmin(request) {
  const token = getAuthToken(request);
  const decoded = verifyToken(token);

  if (!decoded || !decoded.id) {
    return {
      error: jsonResponse(
        { error: "Your session is invalid or has expired." },
        401
      ),
    };
  }

  /*
   * Only an admin-scoped token is accepted. Legacy tokens predate scoping and
   * carry no scope claim, so they are rejected here: an app session must never
   * be able to open the console.
   */
  if (decoded.scope !== ADMIN_SESSION_SCOPE) {
    return {
      error: jsonResponse(
        { error: "Administrator sign-in is required." },
        401
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(decoded.id) },
    select: {
      id: true,
      username: true,
      fullName: true,
      section: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    return {
      error: jsonResponse(
        { error: "Admin account no longer exists." },
        401
      ),
    };
  }

  if (String(user.role).toLowerCase() !== "admin") {
    return {
      error: jsonResponse(
        { error: "Administrator access is required." },
        403
      ),
    };
  }

  return { user };
}

function randomCodePart() {
  const bytes = crypto.randomBytes(CODE_GROUP_LENGTH);
  let result = "";
  for (let i = 0; i < CODE_GROUP_LENGTH; i += 1) {
    result += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return result;
}

function generateInviteCode() {
  return `CRLA-${randomCodePart()}-${randomCodePart()}`;
}

function isUsableInvite(invite) {
  if (!invite || invite.isUsed) return false;
  if (!invite.expiresAt) return true;
  return new Date(invite.expiresAt).getTime() > Date.now();
}

function serializeInvite(invite) {
  return {
    id: invite.id,
    code: invite.code,
    is_used: Boolean(invite.isUsed),
    expires_at: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
    created_at: invite.createdAt ? new Date(invite.createdAt).toISOString() : null,
    status: isUsableInvite(invite)
      ? "active"
      : invite.isUsed
      ? "used"
      : "expired",
  };
}

function serializeBugReport(row) {
  return {
    id: row.id,
    name: row.name ?? "",
    contact: row.contact ?? "",
    message: row.message ?? "",
    page_url: row.pageUrl ?? "",
    user_agent: row.userAgent ?? "",
    is_resolved: Boolean(row.isResolved),
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

function serializeFeedback(row) {
  return {
    id: row.id,
    name: row.name ?? "",
    contact: row.contact ?? "",
    message: row.message ?? "",
    page_url: row.pageUrl ?? "",
    is_resolved: Boolean(row.isResolved),
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

async function getDashboardData(user) {
  const [invites, teacherCount, activeInvite, bugReports, feedback, openBugs, openFeedback] = await Promise.all([
    prisma.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      take: DEFAULT_HISTORY_LIMIT,
      select: {
        id: true,
        code: true,
        isUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({
      where: { role: "teacher" },
    }),
    prisma.inviteCode.findFirst({
      where: {
        isUsed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        isUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
    prisma.bugReport.findMany({
      orderBy: { createdAt: "desc" },
      take: DEFAULT_HISTORY_LIMIT,
    }),
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: DEFAULT_HISTORY_LIMIT,
    }),
    prisma.bugReport.count({ where: { isResolved: false } }),
    prisma.feedback.count({ where: { isResolved: false } }),
  ]);

  return {
    admin: {
      id: user.id,
      username: user.username,
      full_name: user.fullName ?? "",
      section: user.section ?? "",
      role: String(user.role).toLowerCase(),
    },
    active_code: activeInvite ? serializeInvite(activeInvite) : null,
    stats: {
      active_codes: invites.filter((item) => isUsableInvite(item)).length,
      used_codes: invites.filter((item) => Boolean(item.isUsed)).length,
      total_codes: invites.length,
      teacher_accounts: teacherCount,
    },
    history: invites.map(serializeInvite),
    bug_reports: bugReports.map(serializeBugReport),
    feedback: feedback.map(serializeFeedback),
    inbox: {
      bug_reports_total: bugReports.length,
      feedback_total: feedback.length,
      open_bug_reports: openBugs,
      open_feedback: openFeedback,
    },
  };
}

async function generateNewCode(adminId) {
  return prisma.$transaction(async (tx) => {
    await tx.inviteCode.updateMany({
      where: { isUsed: false },
      data: { isUsed: true },
    });

    let code = generateInviteCode();
    let collision = await tx.inviteCode.findFirst({
      where: { code },
      select: { id: true },
    });

    while (collision) {
      code = generateInviteCode();
      collision = await tx.inviteCode.findFirst({
        where: { code },
        select: { id: true },
      });
    }

    const invite = await tx.inviteCode.create({
      data: {
        code,
        isUsed: false,
        expiresAt: null,
        generatedBy: adminId,
      },
      select: {
        id: true,
        code: true,
        isUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return invite;
  });
}

export async function GET(request) {
  try {
    const result = await requireAdmin(request);
    if (result.error) return result.error;

    const action = String(
      request.nextUrl.searchParams.get("action") || "overview"
    ).trim().toLowerCase();

    if (action === "overview") {
      return jsonResponse(await getDashboardData(result.user));
    }

    return jsonResponse(
      { error: `Unknown admin action: ${action}` },
      400
    );
  } catch (error) {
    console.error("Admin GET error:", error);
    return jsonResponse(
      { error: "Unable to load the administrator dashboard." },
      500
    );
  }
}

export async function POST(request) {
  try {
    const result = await requireAdmin(request);
    if (result.error) return result.error;

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const action = String(body?.action || "")
      .trim()
      .toLowerCase();

    if (action === "generate_code" || action === "reset_code") {
      const invite = await generateNewCode(result.user.id);
      return jsonResponse({
        status: "ok",
        message:
          action === "reset_code"
            ? "A fresh teacher invite code is ready."
            : "A new teacher invite code has been generated.",
        code: serializeInvite(invite),
      });
    }

    if (action === "update_report" || action === "delete_report") {
      const type = String(body?.type || "")
        .trim()
        .toLowerCase();
      const id = Number(body?.id);
      const isBug = type === "bug" || type === "bug_report";
      const isFeedback = type === "feedback";

      if ((!isBug && !isFeedback) || !Number.isInteger(id) || id <= 0) {
        return jsonResponse({ error: "A valid report type and id are required." }, 400);
      }

      if (action === "delete_report") {
        if (isBug) await prisma.bugReport.delete({ where: { id } });
        else await prisma.feedback.delete({ where: { id } });
        return jsonResponse({ status: "ok", message: "Entry deleted." });
      }

      const data = { isResolved: Boolean(body?.is_resolved ?? true) };
      if (isBug) await prisma.bugReport.update({ where: { id }, data });
      else await prisma.feedback.update({ where: { id }, data });
      return jsonResponse({ status: "ok", message: "Entry updated." });
    }

    return jsonResponse(
      { error: `Unknown admin action: ${action}` },
      400
    );
  } catch (error) {
    console.error("Admin POST error:", error);
    return jsonResponse(
      { error: "Unable to update administrator settings." },
      500
    );
  }
}
