import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";

export function logSecureError(label, error) {
  // Never log ORM arguments, SQL, request bodies, tokens, names, or provider responses.
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error?.code || "")) ? error.code : "REQUEST_FAILED";
  console.error(String(label).slice(0, 100), { code });
}
export function requestIp(request) {
  return String(request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100);
}
function rateResponse(status, error, retry = 600) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", "Retry-After": String(retry) } });
}
async function takeBucket(identity, limit, seconds) {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Rate limiter is unavailable.");
  const now = Date.now(), slot = Math.floor(now / (seconds * 1000));
  const key = crypto.createHmac("sha256", secret).update(`${identity}:${slot}`).digest("hex");
  const expires = new Date((slot + 2) * seconds * 1000);
  const rows = await prisma.$queryRaw`INSERT INTO public.security_rate_buckets (key, count, expires_at)
    VALUES (${key}, 1, ${expires}) ON CONFLICT (key) DO UPDATE SET count = LEAST(security_rate_buckets.count + 1, ${limit + 1}) RETURNING count`;
  if (key.startsWith("00")) await prisma.securityRateBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  return Number(rows[0]?.count) <= limit;
}
export async function enforceSensitiveRate(request, action, body = {}) {
  const sensitive = new Set(["login", "request_account_unlock", "signup", "register", "validate_invite", "admin_signup", "verify_login_2fa", "forgot_password", "reset_password", "public_report", "assessment_join"]);
  if (!sensitive.has(action)) return null;
  try {
    const ip = requestIp(request);
    const group = ["login", "verify_login_2fa"].includes(action) ? "signin" : action;
    if (!await takeBucket(`${group}:ip:${ip}`, group === "signin" ? 120 : action === "assessment_join" ? 240 : action === "public_report" ? 10 : 40, 600)) return rateResponse(429, "Too many attempts. Try again shortly.");
    const identifier = String(body.username || body.invite_code || body.email || body.unlock_token || (action === "verify_login_2fa" ? request.cookies?.get?.("crla_2fa_challenge")?.value : "") || (action === "assessment_join" ? body.code : "") || "").trim().toLowerCase().slice(0, 254);
    // Password failures now have a persistent, row-locked account counter.
    // A second fixed-window limit must not outlast the five-minute admin lock.
    if (action !== "login" && identifier && !await takeBucket(`${group}:account:${identifier}`, group === "signin" ? 10 : action === "assessment_join" ? 60 : 8, 600)) return rateResponse(429, "Too many attempts. Try again shortly.");
    return null;
  } catch (error) {
    logSecureError("Request limiter unavailable", error);
    return rateResponse(503, "This request is temporarily unavailable. Try again shortly.", 30);
  }
}
