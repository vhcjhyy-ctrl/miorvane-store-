import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight health probe; deliberately returns no environment or secret configuration. */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "job-agent", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
