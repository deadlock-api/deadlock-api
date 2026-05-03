#!/usr/bin/env bash
# Source this file to populate CH_* env vars from a .env file.
# Usage: source _load_env.sh <env_path>
# Reads:
#   CLICKHOUSE_HOST, CLICKHOUSE_HTTP_PORT,
#   CLICKHOUSE_USERNAME, CLICKHOUSE_PASSWORD,
#   (optional) CLICKHOUSE_RESTRICTED_USERNAME, CLICKHOUSE_RESTRICTED_PASSWORD,
#   CLICKHOUSE_DBNAME
# Sets:
#   CH_HOST, CH_PORT, CH_USER, CH_PASS, CH_DB, CH_URL

set -euo pipefail

if [[ -z "${1:-}" ]]; then
    echo "usage: source _load_env.sh <path-to-.env>" >&2
    return 1 2>/dev/null || exit 1
fi

ENV_PATH="$1"
if [[ ! -f "$ENV_PATH" ]]; then
    echo "env file not found: $ENV_PATH" >&2
    return 1 2>/dev/null || exit 1
fi

# Pull only the keys we care about; tolerate quotes and trailing spaces.
_get() {
    grep -E "^${1}=" "$ENV_PATH" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

CH_HOST=$(_get CLICKHOUSE_HOST)
CH_PORT=$(_get CLICKHOUSE_HTTP_PORT)
CH_DB=$(_get CLICKHOUSE_DBNAME)

# Prefer the read-only user when both exist, to avoid accidental writes.
RO_USER=$(_get CLICKHOUSE_RESTRICTED_USERNAME || true)
RO_PASS=$(_get CLICKHOUSE_RESTRICTED_PASSWORD || true)
PRIV_USER=$(_get CLICKHOUSE_USERNAME)
PRIV_PASS=$(_get CLICKHOUSE_PASSWORD)

if [[ -n "$RO_USER" && -n "$RO_PASS" ]]; then
    CH_USER="$RO_USER"
    CH_PASS="$RO_PASS"
else
    CH_USER="$PRIV_USER"
    CH_PASS="$PRIV_PASS"
fi

if [[ -z "$CH_HOST" || -z "$CH_PORT" || -z "$CH_USER" ]]; then
    echo "missing required CLICKHOUSE_* keys in $ENV_PATH" >&2
    return 1 2>/dev/null || exit 1
fi

# URL-encode just enough for password to survive in basic auth.
_enc() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}
CH_URL="http://$(_enc "$CH_USER"):$(_enc "$CH_PASS")@${CH_HOST}:${CH_PORT}/"

# Privileged URL is used only for system.query_log lookups, which the
# readonly role typically can't read.
if [[ -n "$PRIV_USER" && -n "$PRIV_PASS" ]]; then
    CH_URL_PRIV="http://$(_enc "$PRIV_USER"):$(_enc "$PRIV_PASS")@${CH_HOST}:${CH_PORT}/"
else
    CH_URL_PRIV="$CH_URL"
fi

export CH_HOST CH_PORT CH_USER CH_PASS CH_DB CH_URL CH_URL_PRIV
echo "[env] connected as $CH_USER@$CH_HOST:$CH_PORT (db=${CH_DB:-default})" >&2
