import { createHmac } from "node:crypto";
import { z } from "zod";

const shortText = z.string().trim().max(160);
const SocialStatsSchema = z
  .object({
    academics: shortText.optional(),
    charm: shortText.optional(),
    courage: shortText.optional(),
  })
  .strict();

const PlayerProfileSchema = z
  .object({
    currentMonth: shortText.optional(),
    currentDate: shortText.optional(),
    currentLevel: shortText.optional(),
    difficulty: shortText.optional(),
    activeParty: z.array(shortText).max(8).optional(),
    recentBoss: shortText.optional(),
    recentEnemy: shortText.optional(),
    tartarusBlock: shortText.optional(),
    tartarusFloor: shortText.optional(),
    currentSocialLinks: z.array(shortText).max(24).optional(),
    activeRequests: z.array(shortText).max(30).optional(),
    ownedPersonas: z.array(shortText).max(24).optional(),
    dlcOwnership: z.enum(["none", "all"]).optional(),
    socialStats: SocialStatsSchema.optional(),
    playstyle: shortText.optional(),
    currentGoal: z.string().trim().max(500).optional(),
    spoilerPreference: z.enum(["strict", "progress-aware", "open"]).optional(),
  })
  .strict();

export const ChatRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    conversationId: z.string().trim().min(1).max(128).optional(),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(3_000),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    playerProfile: PlayerProfileSchema.optional(),
    debug: z.boolean().optional(),
    stream: z.boolean().optional(),
  })
  .strict();

export type ValidatedChatRequest = z.infer<typeof ChatRequestSchema>;

export class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readValidatedChatRequest(
  request: Request,
  maxBytes = 32_768,
): Promise<ValidatedChatRequest> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new RequestValidationError("Content-Type must be application/json.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestValidationError("Request body is too large.", 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw new RequestValidationError("Request body is too large.", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.", 400);
  }

  const result = ChatRequestSchema.safeParse(parsed);
  if (!result.success) {
    throw new RequestValidationError("Request body contains invalid fields.", 400);
  }

  return {
    ...result.data,
    debug: process.env.ALLOW_CHAT_DEBUG === "true" && result.data.debug === true,
  };
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function allowedOriginsForRequest(request: Request): Set<string> {
  const values = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestUrl = new URL(request.url);
  const requestOrigin = normalizeOrigin(requestUrl.origin);
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host");
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.replace(":", "");
  const forwardedOrigin = forwardedHost
    ? normalizeOrigin(`${forwardedProtocol}://${forwardedHost}`)
    : null;
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? normalizeOrigin(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    : null;
  const vercelDeployment = process.env.VERCEL_URL
    ? normalizeOrigin(`https://${process.env.VERCEL_URL}`)
    : null;

  const allowed = new Set(
    [...values, requestOrigin, forwardedOrigin, vercelProduction, vercelDeployment]
      .map((value) => (value ? normalizeOrigin(value) : null))
      .filter((value): value is string => Boolean(value)),
  );

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
    allowed.add("http://localhost:5181");
    allowed.add("http://127.0.0.1:5181");
  }

  return allowed;
}

export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && allowedOriginsForRequest(request).has(normalized));
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const normalized = origin ? normalizeOrigin(origin) : null;
  const allowOrigin =
    normalized && allowedOriginsForRequest(request).has(normalized) ? normalized : null;

  return {
    ...(allowOrigin ? { "access-control-allow-origin": allowOrigin } : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

export function requestFingerprint(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) || "unknown";
  const secret =
    process.env.RATE_LIMIT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-development-only";

  return createHmac("sha256", secret)
    .update(`${address}\n${userAgent}`)
    .digest("hex");
}
