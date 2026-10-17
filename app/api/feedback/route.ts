import { NextResponse } from "next/server";
import {
  corsHeaders,
  readValidatedFeedback,
  RequestValidationError,
  requestFingerprint,
  requestOriginAllowed,
} from "../../../src/security/chatSecurity";
import { checkChatRateLimit } from "../../../src/security/rateLimit";

export const runtime = "nodejs";

/**
 * Thumbs up/down on a chat reply. Stored server-side only (answer_feedback, service role) so
 * failing answers can be reviewed and turned into eval cases. Shares the chat rate limit.
 */
export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ ok: false }, { status: 403, headers: corsHeaders(request) });
  }

  let feedback;
  try {
    feedback = await readValidatedFeedback(request);
  } catch (error) {
    const status = error instanceof RequestValidationError ? error.status : 400;
    return NextResponse.json({ ok: false }, { status, headers: corsHeaders(request) });
  }

  const fingerprint = requestFingerprint(request);
  try {
    const rateLimit = await checkChatRateLimit(fingerprint);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { ...corsHeaders(request), "retry-after": String(rateLimit.retryAfter) } },
      );
    }
    const { supabase } = await import("../../../src/db/client");
    const { error } = await supabase.from("answer_feedback").insert({
      rating: feedback.rating,
      question: feedback.question,
      answer: feedback.answer,
      intent: feedback.intent ?? null,
      note: feedback.note ?? null,
      history: feedback.history ?? [],
      player_profile: feedback.playerProfile ?? {},
      client_fingerprint: fingerprint.slice(0, 128),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
  } catch {
    console.error("Saving answer feedback failed.");
    return NextResponse.json({ ok: false }, { status: 503, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: Request) {
  if (!requestOriginAllowed(request)) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(request) });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
