import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Keep-alive probe for the free Supabase project (paused after ~7 days without activity).
 * Called daily by Vercel Cron and a GitHub Actions backup. Runs one minimal read and
 * exposes no data or error details.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  }

  try {
    // Dynamic import: the client module throws at load time when server env is missing,
    // which must surface as a plain 503 rather than a crash with details.
    const { supabase } = await import("../../../src/db/client");
    const { error } = await supabase.from("sources").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    console.error("Health check failed.");
    return NextResponse.json({ ok: false }, { status: 503, headers: noStore });
  }
}
