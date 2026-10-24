import { NextRequest, NextResponse } from "next/server";
import { POST as assessmentPost } from "../route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function headers(request) {
  return { "Cache-Control": "no-store", "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept", "Vary": "Origin" };
}
export async function OPTIONS(request) { return new NextResponse(null, { status: 204, headers: headers(request) }); }
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: headers(request) }); }
  const code = String(body?.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return NextResponse.json({ error: "Please enter the 6-character assessment code." }, { status: 400, headers: headers(request) });
  // Do not forward caller actions, replay flags, cookies or bearer credentials.
  const url = new URL("/api/assessment?action=learner_join", request.url);
  const incoming = new Headers(request.headers); incoming.delete("cookie"); incoming.delete("authorization"); incoming.delete("x-authorization"); incoming.delete("content-length");
  incoming.set("Content-Type", "application/json");
  const response = await assessmentPost(new NextRequest(url, { method: "POST", headers: incoming, body: JSON.stringify({ action: "learner_join", code }) }));
  const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
  for (const [key, value] of Object.entries(headers(request))) result.headers.set(key, value);
  return result;
}
