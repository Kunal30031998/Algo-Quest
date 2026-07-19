import type { NextFunction, Request, Response } from "express";
import { redis } from "../db/redis";

interface RateLimitOptions {
  keyPrefix: string;
  windowSeconds: number;
  max: number;
  keyFor: (req: Request) => string;
  rejectedMessage: string;
}

// Redis-backed (not in-process memory, per the "design for 2+ instances"
// constraint) fixed-window counter. Fails closed: if Redis itself is
// unreachable, the request is rejected rather than let through unlimited —
// an unavailable rate limiter should not mean "no rate limiting" on
// endpoints this sensitive (submissions execute hostile code; auth is a
// classic brute-force target).
export function fixedWindowRateLimit(options: RateLimitOptions) {
  return async function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = `ratelimit:${options.keyPrefix}:${options.keyFor(req)}`;

    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }
    } catch {
      res.status(503).json({ error: "Rate limiting is temporarily unavailable" });
      return;
    }

    if (count > options.max) {
      const ttl = await redis.ttl(key).catch(() => options.windowSeconds);
      res.setHeader("Retry-After", String(Math.max(ttl, 1)));
      res.status(429).json({ error: options.rejectedMessage });
      return;
    }

    next();
  };
}
