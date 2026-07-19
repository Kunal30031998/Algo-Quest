import type { Request } from "express";
import { fixedWindowRateLimit } from "./fixedWindowRateLimit";

// Keyed by IP (req.ip), not userId — these run before authentication, so
// there's no user identity to key on yet. This only catches a single
// source hammering many accounts; it does not catch distributed brute
// force against one target account (would need a second limiter keyed by
// the submitted email/username) — noted as a follow-up, not built here.
//
// req.ip's accuracy depends on Express's "trust proxy" setting matching
// the real deployment topology (load balancer / reverse proxy) once this
// runs behind one — not yet configured, since that topology isn't decided.
function keyForIp(req: Request): string {
  return req.ip ?? "unknown";
}

export const registerRateLimit = fixedWindowRateLimit({
  keyPrefix: "auth:register",
  windowSeconds: 900,
  max: 10,
  keyFor: keyForIp,
  rejectedMessage: "Too many registration attempts — slow down",
});

export const loginRateLimit = fixedWindowRateLimit({
  keyPrefix: "auth:login",
  windowSeconds: 900,
  max: 10,
  keyFor: keyForIp,
  rejectedMessage: "Too many login attempts — slow down",
});
