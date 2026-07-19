# AQ-6 — Sandbox security review

Authoritative record of the review: what was checked, the config enforcing
it, and the actual command + observed output — not assumptions. Run
2026-07-18 against the live stack (`docker compose up -d`, real Postgres,
real Redis, real Judge0, real HTTP calls through `POST /submissions`).

## Scope

The three ACs on this ticket (limits verified, network confirmed, rate
limiting), plus four findings from static review that were judged worth
closing now rather than deferring:

- **F1 — unbounded output could exhaust server memory.** `client.ts` never
  capped Judge0's output; the server buffered the full response into memory
  via `response.json()` before truncating for storage. Fixed by sending
  `max_file_size` on every request (bounds output *inside* Judge0/isolate).
- **F2 — compile-time ceilings were generous** (15s CPU / 20s wall,
  Judge0's own defaults) — a compile bomb could occupy a worker that long.
  Tightened to 10s/10s given we only support 4 known languages.
- **F4 — no cap on test cases per submission.** Each test case is a
  sequential synchronous Judge0 call; nothing bounded total worker
  occupancy if a `Problem` ever had many. Capped at 20.
- **F5 — Judge0 shared the default docker network** with `algoquest-postgres`.
  Not a sandbox-escape path (submitted code has no network access
  regardless), but a compromised Judge0 *container* could otherwise reach
  it. Moved Judge0's four services to a dedicated `judge0-net`.

**F3 — inherent residual risk, not "fixed," documented below:** Judge0
runs `privileged: true` with `cgroup: host` (both required for cgroup v2
delegation — see [judge0/README.md](README.md)). An `isolate` escape means
host root. This is intrinsic to isolate-based judging; mitigated by network
isolation, resource limits, isolate's own namespacing, and running boxes as
non-root UIDs ≥60000 — not eliminated. Production hardening options
(dedicated VM, gVisor, a seccomp profile beyond isolate's own) are future
work, not in scope here.

## AC1 — CPU/memory/process/wall-clock limits: verified, not assumed

Every case below is a real `POST /submissions` call through the actual app
API (not raw Judge0), so it reflects exactly what an end user experiences.

| Case | Command | Observed |
|---|---|---|
| CPU busy loop | `while True: x+=1` | `TIME_LIMIT_EXCEEDED`, message "Time limit exceeded" |
| **Wall-clock limit** (doesn't burn CPU — the AQ-5 gap) | `time.sleep(100)` | `TIME_LIMIT_EXCEEDED`, message "Time limit exceeded (**wall clock**)" — killed at the configured 5s, not 100s |
| Memory bomb | `bytearray(500 * 1024 * 1024)` | `MEMORY_LIMIT_EXCEEDED`, process killed at the 128000 KB limit |
| Fork bomb | `os.fork()` × 10000 | `RUNTIME_ERROR` — first fork after the pids cap raises `BlockingIOError: Resource temporarily unavailable`; host stayed responsive throughout |
| Deep recursion | unbounded recursion, `setrecursionlimit(10**7)` | `MEMORY_LIMIT_EXCEEDED` — Python's per-frame interpreter overhead exhausts the memory cap before triggering a distinct stack fault; still fully contained, just via a different mechanism than a compiled language would hit |
| **Output flood (F1)** | `for _ in range(10**8): print("x"*100)`, called directly against Judge0 to inspect the raw response | stdout capped at **exactly 1,048,576 bytes** (`max_file_size=1024` KB) before our server ever sees it; process killed with `OSError: [Errno 27] File too large` |
| Box cleanup | ~40+ submissions run over the course of this review | 0 residual `box-N` directories in `/var/local/lib/isolate/`, 4.0K total (empty parent dir) |

Every limit is injected server-side in `server/src/judge0/client.ts`
(`cpu_time_limit`, `wall_time_limit`, `memory_limit`, `max_file_size`) —
`POST /submissions`'s request body has no field a caller could use to
override any of them. Guarded by a regression test
(`client.test.ts` — "always sends server-controlled resource limits, not
caller-controlled ones").

## AC2 — No network access from execution containers: confirmed

Two distinct layers, both tested:

**Layer 1 — the sandbox itself** (submitted code, via `ENABLE_NETWORK=false`
+ isolate's own network namespace). All four attempts, run as real
submissions through the app:

| Target | Result |
|---|---|
| Internet (`8.8.8.8:53`) | `RUNTIME_ERROR` — connect fails |
| Judge0's own `judge0-db` | `RUNTIME_ERROR` — connect fails |
| `algoquest-postgres` (the app's real DB) | `RUNTIME_ERROR` — connect fails |
| DNS resolution (`google.com`) | `RUNTIME_ERROR` — resolution fails |

The sandbox reaches nothing — not even its own supporting infrastructure.

**Layer 2 — the Judge0 *container* itself** (F5, defense-in-depth: even if
`isolate` were somehow escaped). Tested directly from inside
`judge0-workers` via `docker exec`:

```
worker -> judge0-db (own network):        REACHABLE
worker -> algoquest-postgres:              UNREACHABLE (DNS fails — different docker network)
worker -> app redis:                       UNREACHABLE (DNS fails — different docker network)
```

## AC3 — Rate limiting on submissions per user

Redis-backed fixed-window counter (`INCR`+`EXPIRE`), keyed per user —
deliberately not in-process memory, per the project's "design for 2+
instances" constraint. 20 submissions / 60s window.

- **Enforced before the submission row is created** — a rate-limited user
  can't fill the database with PENDING rows either.
- **Fails closed**: if Redis itself is unreachable, submissions are
  rejected (503) rather than let through unlimited. Verified via a mocked
  Redis failure in `submissionRateLimit.test.ts`.
- Live-tested: exceeding the window returns `429` with a `Retry-After`
  header reflecting the real remaining TTL (`Retry-After: 58` observed);
  the limit recovers once the window rolls over.

The limit (20/60s) is a starting number, not derived from load testing —
worth revisiting once real usage patterns exist.

## Beyond AC3 — auth rate limiting (added during review)

`POST /submissions` was the ticket's literal AC, but auth endpoints are the
classic brute-force/credential-stuffing target and had zero protection.
Same Redis-backed fixed-window pattern (extracted into a shared
`fixedWindowRateLimit` factory), applied to `/auth/register` and
`/auth/login` — 10 attempts / 15 minutes, **keyed by IP** rather than
userId (there's no user identity yet at this point in the flow), with
independent counters per endpoint so hammering one doesn't consume the
other's budget. Also fails closed, same reasoning as AC3.

Live-verified: 10 wrong-password `/auth/login` attempts succeeded (401
each), the 11th got `429` with `Retry-After: 889`; `/auth/register` from
the same IP succeeded immediately after, confirming the counters are
independent.

**Known gaps, not built here:**
- IP-based only — catches a single source hammering many accounts, not
  distributed brute force against *one* target account (would need a
  second limiter keyed by the submitted email/username).
- `req.ip`'s accuracy depends on Express's `trust proxy` setting matching
  whatever reverse proxy / load balancer this ends up behind — not
  configured, since that deployment topology isn't decided yet.

## What AQ-6 does not cover

- Load/stress testing at scale (many concurrent users, sustained high
  submission volume) — this review is correctness-of-controls, not
  capacity planning.
- The resource-limit *values* (2s CPU, 5s wall, 128MB) were carried over
  from AQ-5's initial defaults, not independently re-derived here — they
  held up under the tests above but haven't been adversarially tuned
  against, say, a legitimate slow-but-correct solution.
- Judge0 itself is a custom-rebuilt image (see judge0/README.md), not an
  official release — worth a read of `judge0/Dockerfile` specifically,
  separate from this functional review.
- F3 (privileged + cgroup:host residual risk) is documented, not resolved.
