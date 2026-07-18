import type { Judge0Result } from "./client";

export type MappedStatus =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILE_ERROR"
  | "INTERNAL_ERROR";

const MEMORY_LIMIT_KB = 128_000;

// Judge0 has no first-class "memory limit exceeded" status — a memory-bombed
// process just gets killed and reported as a runtime error. We verified this
// directly: a submission allocating 500MB against a 128000KB limit came back
// as "Runtime Error (NZEC)" with memory reported at exactly the limit. So a
// runtime error whose memory usage is at or past the limit is treated as
// MLE; this is a heuristic, not a distinct signal from Judge0 itself.
export function mapJudge0Status(result: Judge0Result): MappedStatus {
  switch (result.statusId) {
    case 3:
      return "ACCEPTED";
    case 4:
      return "WRONG_ANSWER";
    case 5:
      return "TIME_LIMIT_EXCEEDED";
    case 6:
      return "COMPILE_ERROR";
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
      return (result.memory ?? 0) >= MEMORY_LIMIT_KB ? "MEMORY_LIMIT_EXCEEDED" : "RUNTIME_ERROR";
    default:
      // 1 (In Queue), 2 (Processing) shouldn't occur since we use wait=true;
      // 13 (Internal Error), 14 (Exec Format Error), and anything else land here.
      return "INTERNAL_ERROR";
  }
}
