#!/bin/sh
# Runs a cargo command in a Rust image build, with sccache caching the compiled crates in the
# GitHub Actions cache when CI hands the build the cache service token.
#
# GitHub-hosted runners start with an empty builder, so the image builds would otherwise compile
# every crate from scratch (~15 min for the api). CI passes ACTIONS_RESULTS_URL and
# ACTIONS_RUNTIME_TOKEN as build secrets (secrets don't enter the layer cache key) and the RUN step
# mounts them as env vars. Without them, as in local builds, the command runs as is and the
# Dockerfile's target cache mount does the caching.
#
# Usage: with-sccache.sh cargo build --release ...
set -eu

if [ -z "${ACTIONS_RESULTS_URL:-}" ] || [ -z "${ACTIONS_RUNTIME_TOKEN:-}" ]; then
    exec "$@"
fi

export SCCACHE_GHA_ENABLED=on
# The v1 cache service is gone; sccache only talks to v2 when this is set.
export ACTIONS_CACHE_SERVICE_V2=on
# Content-addressed keys, so images with the same RUSTFLAGS (api, workers) share entries.
export SCCACHE_GHA_VERSION=docker-v1

# The server refuses to start when the cache service is unreachable, which would fail every
# compile. A cache outage only makes the build slow: compile without sccache then. (Once started,
# failed cache reads and writes are just misses.)
if ! sccache --start-server; then
    echo "with-sccache: sccache did not start, building without it" >&2
    exec "$@"
fi
# cc-rs picks up RUSTC_WRAPPER=sccache, so C/C++ sources of -sys crates (duckdb) are cached too.
export RUSTC_WRAPPER=sccache

status=0
"$@" || status=$?
# Stopping the server flushes pending cache writes and prints the hit rate to the build log.
sccache --stop-server || true
exit "$status"
