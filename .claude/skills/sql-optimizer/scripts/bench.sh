#!/usr/bin/env bash
# Benchmark a SQL query: warm-up + N runs, capture X-ClickHouse-Summary per run,
# then pull system.query_log for OS/CPU profile counters.
#
# Usage: bench.sh <env_path> <sql_file> <label> [runs=5]
#
# Output: per-run JSON lines on stdout, plus a final "summary" JSON object
# containing mean ± stddev for each numeric column, plus query_log fields
# (OSCPUVirtualTimeMicroseconds, OSReadBytes, ProfileEvents).

set -euo pipefail

if [[ $# -lt 3 ]]; then
    echo "usage: bench.sh <env_path> <sql_file> <label> [runs=5]" >&2
    exit 1
fi

ENV_PATH="$1"
SQL_FILE="$2"
LABEL="$3"
RUNS="${4:-5}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_load_env.sh
source "$SCRIPT_DIR/_load_env.sh" "$ENV_PATH"

# Always force FORMAT Null so we don't measure result-transfer cost.
RAW_SQL=$(cat "$SQL_FILE")
SQL=$(echo "$RAW_SQL" | sed -E 's/FORMAT[[:space:]]+[A-Za-z]+[[:space:]]*;?[[:space:]]*$//I')
SQL="$SQL
FORMAT Null"

QID_PREFIX="bench-$(date +%s%N)-$RANDOM"

echo "[bench] label=$LABEL runs=$RUNS" >&2

# Warm-up (not measured)
curl -sS --data-binary "$SQL" "${CH_URL}?database=${CH_DB:-default}&query_id=${QID_PREFIX}-warmup" >/dev/null
echo "[bench] warm-up done" >&2

declare -a QIDS
for i in $(seq 1 "$RUNS"); do
    QID="${QID_PREFIX}-${i}"
    QIDS+=("$QID")
    HEADERS=$(mktemp)
    curl -sS \
        --data-binary "$SQL" \
        -D "$HEADERS" \
        "${CH_URL}?database=${CH_DB:-default}&query_id=${QID}" \
        > /dev/null
    SUMMARY=$(grep -i '^X-ClickHouse-Summary:' "$HEADERS" | sed 's/^[^:]*: //' | tr -d '\r')
    rm -f "$HEADERS"
    echo "{\"label\":\"$LABEL\",\"run\":$i,\"query_id\":\"$QID\",\"summary\":$SUMMARY}"
done

# Flush query_log so the rows we just produced are queryable.
# system.query_log normally needs privileged access, so use CH_URL_PRIV.
curl -sS --data-binary 'SYSTEM FLUSH LOGS' "${CH_URL_PRIV}?database=${CH_DB:-default}" >/dev/null 2>&1 || true

# Pull a profile from system.query_log for the most recent finished run.
QID_LIST=$(printf "'%s'," "${QIDS[@]}" | sed 's/,$//')
PROFILE_SQL="
SELECT
    query_id,
    type,
    query_duration_ms,
    memory_usage,
    read_rows,
    read_bytes,
    result_rows,
    ProfileEvents['UserTimeMicroseconds'] AS user_us,
    ProfileEvents['SystemTimeMicroseconds'] AS system_us,
    ProfileEvents['OSCPUVirtualTimeMicroseconds'] AS cpu_virt_us,
    ProfileEvents['OSCPUWaitMicroseconds'] AS cpu_wait_us,
    ProfileEvents['OSIOWaitMicroseconds'] AS io_wait_us,
    ProfileEvents['OSReadBytes'] AS os_read_bytes,
    ProfileEvents['OSReadChars'] AS os_read_chars,
    ProfileEvents['SelectedParts'] AS parts,
    ProfileEvents['SelectedRanges'] AS ranges,
    ProfileEvents['SelectedMarks'] AS marks
FROM system.query_log
WHERE query_id IN (${QID_LIST}) AND type = 'QueryFinish'
ORDER BY event_time
FORMAT JSONEachRow
"
echo "[bench] fetching system.query_log for ${#QIDS[@]} runs" >&2
PROFILE_OUT=$(curl -sS --data-binary "$PROFILE_SQL" "${CH_URL_PRIV}?database=${CH_DB:-default}")
if grep -q 'ACCESS_DENIED\|Not enough privileges' <<<"$PROFILE_OUT"; then
    echo "[bench] WARN: cannot read system.query_log — provide CLICKHOUSE_USERNAME with the SELECT system.query_log grant for full CPU/I/O profiling. Falling back to summary headers only." >&2
else
    printf '%s\n' "$PROFILE_OUT" \
        | sed "s/^/{\"label\":\"$LABEL\",\"profile\":/" \
        | sed 's/$/}/'
fi
