import { createClient } from "@supabase/supabase-js";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function checkWindow(
  clientKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Rate limiting requires Supabase configuration.");
    }
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("check_chat_rate_limit", {
    p_client_key: clientKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    throw new Error(`Rate-limit check failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
  if (!row) {
    throw new Error("Rate-limit check returned no result.");
  }

  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfter: row.retry_after,
  };
}

export async function checkChatRateLimit(clientFingerprint: string): Promise<RateLimitResult> {
  if (
    process.env.DISABLE_CHAT_RATE_LIMIT === "true" &&
    process.env.ALLOW_CHAT_DEBUG === "true"
  ) {
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };
  }

  const minuteLimit = positiveInteger(process.env.CHAT_RATE_LIMIT_PER_MINUTE, 20);
  const dailyLimit = positiveInteger(process.env.CHAT_RATE_LIMIT_PER_DAY, 250);

  const [minute, daily] = await Promise.all([
    checkWindow(`${clientFingerprint}:minute`, minuteLimit, 60),
    checkWindow(`${clientFingerprint}:day`, dailyLimit, 86_400),
  ]);

  if (!minute.allowed) return minute;
  if (!daily.allowed) return daily;

  return {
    allowed: true,
    remaining: Math.min(minute.remaining, daily.remaining),
    retryAfter: 0,
  };
}
