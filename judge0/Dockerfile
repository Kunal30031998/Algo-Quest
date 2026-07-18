# syntax=docker/dockerfile:1
# The official judge0/judge0:1.13.1 image bundles isolate 1.8.1, which only
# supports cgroup v1. Modern Docker/WSL2 hosts run cgroup v2 exclusively, so
# sandboxed execution fails outright ("Failed to create control group").
# This rebuilds isolate from upstream source at a version that supports
# cgroup v2, on top of the same official Judge0 app code.
FROM judge0/judge0:1.13.1@sha256:6b5d6a66aa19a8e878a52ea3c6a560afc1086734d96e2885b561fd5c6018f082

USER root

# Debian buster (this image's base) is EOL; point apt at the archive instead
# of the (now 404) live mirrors.
RUN cat > /etc/apt/sources.list <<'EOF'
deb http://archive.debian.org/debian buster main
deb http://archive.debian.org/debian-security buster/updates main
EOF

RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends \
       build-essential libcap-dev libseccomp-dev curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG ISOLATE_VERSION=v2.6
# Buster's kernel headers predate a few syscalls isolate's seccomp filter
# references (io_uring, quotactl_fd); define their known x86_64 numbers
# manually rather than pulling in newer headers on an EOL base image.
RUN curl -fsSL "https://github.com/ioi/isolate/archive/refs/tags/${ISOLATE_VERSION}.tar.gz" -o /tmp/isolate.tar.gz \
    && mkdir -p /tmp/isolate-src \
    && tar -xzf /tmp/isolate.tar.gz -C /tmp/isolate-src --strip-components=1 \
    && cd /tmp/isolate-src \
    && make isolate CFLAGS_EXTRA='-D__NR_io_uring_setup=425 -D__NR_io_uring_enter=426 -D__NR_io_uring_register=427 -DSYS_quotactl_fd=443' \
    && install -m 4755 isolate /usr/local/bin/isolate.real \
    && cd / && rm -rf /tmp/isolate-src /tmp/isolate.tar.gz

COPY isolate.cf /usr/local/etc/isolate
COPY isolate-wrapper.sh /usr/local/bin/isolate
COPY entrypoint.sh /usr/local/bin/judge0-entrypoint.sh
RUN chmod +x /usr/local/bin/isolate /usr/local/bin/judge0-entrypoint.sh

USER judge0
ENTRYPOINT ["/usr/local/bin/judge0-entrypoint.sh"]
CMD ["/api/scripts/server"]
