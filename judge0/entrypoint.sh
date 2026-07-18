#!/bin/bash
set -e

# isolate 2.x expects a pre-delegated cgroup v2 subtree it can create
# per-sandbox sub-cgroups under (see isolate.cf's cg_root). Enabling
# subtree_control on the container's own cgroup root requires root, which
# the judge0 user gets via the same passwordless sudo the base image
# already relies on for `sudo cron` in its own entrypoint.
CG_ROOT=/sys/fs/cgroup/isolate.judge0
sudo mkdir -p "$CG_ROOT"
# Delegate controllers at the container root so isolate.judge0 gets them...
sudo sh -c 'echo "+cpu +memory +pids" > /sys/fs/cgroup/cgroup.subtree_control'
# ...and delegate again here so isolate's own per-submission box-N children
# actually get memory.max/pids.max files. cgroup v2 delegation is one level
# at a time; skipping this step is what caused "Cannot write .../box-N/
# memory.max: No such file or directory" the first time around.
sudo sh -c 'echo "+cpu +memory +pids" > /sys/fs/cgroup/isolate.judge0/cgroup.subtree_control'

exec /api/docker-entrypoint.sh "$@"
