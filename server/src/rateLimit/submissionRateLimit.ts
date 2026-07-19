import { fixedWindowRateLimit } from "./fixedWindowRateLimit";

// Keyed per authenticated user (req.userId is set by requireAuth, which
// must run before this middleware).
export const submissionRateLimit = fixedWindowRateLimit({
  keyPrefix: "submissions",
  windowSeconds: 60,
  max: 20,
  keyFor: (req) => req.userId!,
  rejectedMessage: "Too many submissions — slow down",
});
