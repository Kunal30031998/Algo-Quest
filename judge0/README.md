# Self-hosted Judge0 — cgroup v2 rebuild

## Why this custom image exists

The official `judge0/judge0:1.13.1` image (last published April 2024) bundles
`isolate` 1.8.1, which only knows how to create **cgroup v1** control groups.
Modern Docker/WSL2 hosts run **cgroup v2 exclusively** — every submission
failed with `Internal Error` / `Failed to create control group`.

Confirmed (2026-07-13/14) that this isn't fixable by configuration:
- Forcing WSL2 into cgroup v1 via `.wslconfig`'s `kernelCommandLine` doesn't
  work for Docker Desktop's backend (its `docker-desktop` distro runs a
  custom init, not systemd, so the flag has nothing to act on).
- It doesn't work for a systemd-based WSL distro either — WSL2's own outer
  init establishes cgroup2 before any inner distro's systemd starts, and
  current systemd (v249+) has dropped the legacy hybrid-hierarchy fallback
  entirely regardless.

So instead: this Dockerfile takes the official `judge0/judge0` app code
as-is and rebuilds only `isolate`, from upstream source, at a version that
speaks cgroup v2 natively.

## What's different from the official image

- `isolate` rebuilt from [ioi/isolate](https://github.com/ioi/isolate) at
  `v2.6` (pinned tag), replacing the bundled 1.8.1. Installed as
  `/usr/local/bin/isolate.real`, setuid-root, same as upstream.
- `/usr/local/bin/isolate` is a wrapper (`isolate-wrapper.sh`) that strips
  `--cg-timing`/`--no-cg-timing` before calling the real binary. Judge0
  1.13.1's Ruby code still passes one of these on every invocation; isolate
  2.x removed both (control-group mode always times this way now). This is
  the only Judge0 app-level incompatibility found — every other flag
  `isolate_job.rb` uses is unchanged in 2.6.
- `entrypoint.sh` delegates the `cpu`/`memory`/`pids` cgroup v2 controllers
  two levels deep before starting Judge0 normally: once at the container's
  own cgroup root, and again at `isolate.judge0` (the subtree isolate
  creates per-submission boxes under). cgroup v2 delegation is one level at
  a time — skipping the second level is what caused `Cannot write
  .../box-N/memory.max: No such file or directory` the first time this was
  built. Both writes are unguarded (no `|| true`): if delegation fails, the
  container should fail to start, not run with a silently weaker sandbox.
- Base image pinned by digest (`judge0/judge0:1.13.1@sha256:6b5d6a66...`),
  not just the mutable `:1.13.1` tag.
- Debian buster (the image's base OS) is EOL; `apt-get` repointed at
  `archive.debian.org` since the live mirrors 404.
- Two syscall constants (`__NR_io_uring_setup`, `SYS_quotactl_fd`) defined
  manually at compile time — buster's 2019-era kernel headers predate both,
  but isolate 2.6's seccomp filter references them.

Both `judge0-server` and `judge0-workers` in `docker-compose.yml` run with
`privileged: true` and `cgroup: host` — required for the cgroup delegation
above to actually reach the host's real cgroup tree rather than a
restricted per-container view.

## Verified (2026-07-18), against the live stack

Every case below was run as a real HTTP submission to `localhost:2358`, not
inferred:

| Case | Result |
|---|---|
| Accepted (stdout matches `expected_output`) | ✅ `status: Accepted` |
| Wrong Answer (stdout mismatch) | ✅ `status: Wrong Answer` |
| stdin passthrough | ✅ echoed correctly |
| C++ compile error | ✅ `status: Compilation Error`, real compiler diagnostic in `compile_output` |
| Runtime error (`1/0`) | ✅ `status: Runtime Error (NZEC)`, real traceback in `stderr` |
| Infinite loop | ✅ `status: Time Limit Exceeded` at the configured wall time |
| Memory bomb (`bytearray(500MB)`) | ✅ killed at exactly `MEMORY_LIMIT` (128000 KB), exit 137 |
| Fork bomb (`os.fork()` × 10000) | ✅ blocked immediately by `pids.max` (`BlockingIOError`), host stayed responsive |
| Network egress attempt | ✅ `OSError: Network is unreachable` |
| Two parallel submissions | ✅ both completed correctly and independently |

This is real evidence for AQ-6, not a substitute for AQ-6's own review —
resource-limit *values*, rate limiting, and anything beyond what's listed
above still need that ticket's dedicated pass.

## Rebuilding

```
docker compose build judge0-server judge0-workers
docker compose up -d judge0-server judge0-workers
```

`ISOLATE_VERSION` is a build arg (`judge0/Dockerfile`) if a future isolate
release needs picking up — check its CLI options and cgroup-delegation
model haven't changed before bumping it blindly.
