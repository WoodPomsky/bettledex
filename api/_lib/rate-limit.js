// Rate limiting: 5 requests per minute per IP, counted in Upstash Redis.
// Counts can't live in function memory: each serverless call may run in a
// fresh instance, so an in-memory counter would reset constantly.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const LIMIT = 5;
const WINDOW = "60 s";

const limiters = new Map();

function getLimiter(name) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in .env");
  }
  if (!limiters.has(name)) {
    limiters.set(
      name,
      new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
        prefix: `battleground:${name}`,
      }),
    );
  }
  return limiters.get(name);
}

// Vercel puts the real client IP first in x-forwarded-for.
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// Local-only off switch: set RATE_LIMIT_DISABLED=true in .env to skip Redis.
// It must be set on purpose. Missing Upstash keys alone still fail closed.
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === "true";
if (RATE_LIMIT_DISABLED) {
  console.warn("⚠️  Rate limiting is OFF (RATE_LIMIT_DISABLED=true). Local use only.");
}

// `name` keeps each endpoint's count separate (e.g. "fight", later "image").
// Returns { allowed, retryAfterSeconds }.
export async function checkRateLimit(req, name) {
  if (RATE_LIMIT_DISABLED) return { allowed: true, retryAfterSeconds: 0 };

  const { success, reset } = await getLimiter(name).limit(getClientIp(req));
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { allowed: success, retryAfterSeconds };
}
