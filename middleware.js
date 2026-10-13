import { NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
const buckets = new Map();
function take(key, limit) {
  const now = Date.now(), slot = Math.floor(now / 60000);
  const found = buckets.get(key);
  const next = found?.slot === slot ? { slot, count: found.count + 1 } : { slot, count: 1 };
  buckets.set(key, next);
  if (buckets.size > 20000) for (const [k, v] of buckets) if (v.slot < slot) buckets.delete(k);
  if (buckets.size > 40000) buckets.delete(buckets.keys().next().value);
  return next.count <= limit;
}
async function fingerprint(value) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), x => x.toString(16).padStart(2,"0")).join("");
}
export async function middleware(request) {
  const { pathname, origin } = request.nextUrl;
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    let allowed = false;
    try {
      const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
      const token = request.cookies.get("crla_admin_token")?.value;
      if (secret && token) {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
        allowed = payload.scope === "admin" && payload.role === "admin" && Number.isInteger(Number(payload.id)) && Number(payload.id) > 0;
      }
    } catch {}
    if (!allowed) return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (pathname.startsWith("/api/")) {
    const fail = (status, error) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
    const authorization = request.headers.get("authorization") || request.headers.get("x-authorization") || "";
    const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
    const suppliedOrigin = request.headers.get("origin");
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const hasSessionCookie = request.cookies.get("crla_token")?.value || request.cookies.get("crla_admin_token")?.value || request.cookies.get("crla_2fa_challenge")?.value;
    const publicLearnerJoin = pathname === "/api/assessment/join" && !hasSessionCookie;
    if (mutation && (crossSite || (suppliedOrigin && suppliedOrigin !== origin)) && (hasSessionCookie || (!publicLearnerJoin && !/^Bearer\s+\S+/i.test(authorization)))) return fail(403, "This request must come from CRL-App.");
    const maxBytes = pathname.includes("import-learners") ? 11 * 1024 * 1024 : pathname.includes("/admin") ? 18 * 1024 * 1024 : pathname.includes("/auth") || pathname.includes("/public/") ? 16384 : 4 * 1024 * 1024;
    if (Number(request.headers.get("content-length") || 0) > maxBytes) return fail(413, "The request is too large.");
    if (authorization.length > 8192 || (request.headers.get("cookie") || "").length > 32768) return fail(431, "The request headers are too large.");
    const ip = String(request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100);
    const auth = pathname.startsWith("/api/auth") || pathname.startsWith("/api/public");
    if (!take(`ip:${ip}:${auth ? "auth" : "api"}`, auth ? 240 : 40000)) return fail(429, "Too many requests. Try again shortly.");
    const token = authorization || request.cookies.get(pathname.startsWith("/api/admin") ? "crla_admin_token" : "crla_token")?.value;
    if (token && !take(`session:${await fingerprint(token)}`, 1800)) return fail(429, "Too many requests. Try again shortly.");
    // A learner code gets its own generous budget; normal live polling has no DB limiter.
    const code = request.nextUrl.searchParams.get("code");
    if (!token && code && !take(`learner:${ip}:${code.slice(0, 20)}`, 1800)) return fail(429, "Too many requests. Try again shortly.");
  }
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*", "/api/:path*"] };
