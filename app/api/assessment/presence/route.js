import { NextRequest } from "next/server";
import { GET as assessmentGet, POST as assessmentPost } from "../route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Translate only presence operations; never accept caller-provided actions.
export async function GET(request) {
  const url = new URL(request.url);
  url.searchParams.set("action", "learner_presence");
  return assessmentGet(new NextRequest(url, { headers: { Accept: "application/json" } }));
}
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid presence request." }, { status: 400 }); }
  if (!["teacher", "learner"].includes(body?.role)) return Response.json({ error: "Invalid device role." }, { status: 400 });
  const url = new URL(request.url);
  url.searchParams.set("action", body.role === "teacher" ? "host_presence" : "learner_presence");
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  if (body.role === "learner") for (const key of ["cookie", "authorization", "x-authorization"]) headers.delete(key);
  headers.set("Content-Type", "application/json");
  return assessmentPost(new NextRequest(url, { method: "POST", headers, body: JSON.stringify({
    code: body.code, nonce: body.nonce, status: body.status, recovering: body.recovering,
  }) }));
}
