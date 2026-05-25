#!/usr/bin/env bash
set -euo pipefail

# Single-pass check (run from cron): dispatches the assets-update workflow when
# the Steam client version is ahead of the latest published build, unless a run
# is already queued/in-progress. Requires an authenticated `gh`.

# gh auth: prefer GH_TOKEN from the env, else read it from an untracked file
# next to this script. NEVER commit the token to this (public) repo.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${GH_TOKEN:-}" ] && [ -f "$SCRIPT_DIR/.gh_token" ]; then
    GH_TOKEN="$(tr -d '[:space:]' < "$SCRIPT_DIR/.gh_token")"
fi
export GH_TOKEN

REPO="${REPO:-deadlock-api/deadlock-api}"
WORKFLOW="${WORKFLOW:-assets-update.yml}"
STEAM_API="https://api.steampowered.com/IGCVersion_1422450/GetClientVersion/v1/"
ALL_STEAM_INFO="https://assets-bucket.deadlock-api.com/assets-api-res/steam-info/all.json.zst"

active_version() {
    curl -fsSL "$STEAM_API" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["active_version"])'
}

published_version() {
    raw=$(curl -fsS "$ALL_STEAM_INFO" 2>/dev/null | zstd -dq 2>/dev/null || true)
    [ -n "$raw" ] || { echo 0; return; }
    printf '%s' "$raw" \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["client_version"] if d else 0)' \
        2>/dev/null || echo 0
}

pipeline_running() {
    local n
    for status in in_progress queued; do
        n=$(gh run list -R "$REPO" --workflow "$WORKFLOW" --status "$status" --json databaseId -q length 2>/dev/null || echo 0)
        [ "${n:-0}" -gt 0 ] && return 0
    done
    return 1
}

if ! active=$(active_version); then
    echo "$(date -u +%FT%TZ) steam api unreachable"
    exit 1
fi
latest=$(published_version)
if [ "$active" = "$latest" ]; then
    echo "$(date -u +%FT%TZ) up to date (version $active)"
    exit 0
fi
if pipeline_running; then
    echo "$(date -u +%FT%TZ) new version $active (published $latest); pipeline already running, skipping"
    exit 0
fi
echo "$(date -u +%FT%TZ) new version $active (published $latest); triggering $WORKFLOW"
gh workflow run "$WORKFLOW" -R "$REPO"
