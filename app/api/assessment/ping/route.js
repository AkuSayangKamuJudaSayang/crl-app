import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { status: "ok", serverTime: Date.now() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-CRL-Ping": "1",
      },
    }
  );
}
