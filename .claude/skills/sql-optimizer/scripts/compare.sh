#!/usr/bin/env bash
# Interleaved A/B benchmark with a statistical significance check.
#
# Runs baseline and candidate back-to-back in alternating order (A,B,A,B,...)
# to cancel out drift from cache warmth / concurrent load, then runs Welch's
# t-test on wall_ms and on memory_usage via significance.py.
#
# Usage: compare.sh <env_path> <sql_file_a> <label_a> <sql_file_b> <label_b> [runs=5] [alpha=0.05]

set -euo pipefail

if [[ $# -lt 5 ]]; then
    echo "usage: compare.sh <env_path> <sql_file_a> <label_a> <sql_file_b> <label_b> [runs=5] [alpha=0.05]" >&2
    exit 1
fi

ENV_PATH="$1"
SQL_FILE_A="$2"
LABEL_A="$3"
SQL_FILE_B="$4"
LABEL_B="$5"
RUNS="${6:-5}"
ALPHA="${7:-0.05}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_load_env.sh
source "$SCRIPT_DIR/_load_env.sh" "$ENV_PATH"

prep_sql() {
    local raw
    raw=$(cat "$1")
    raw=$(echo "$raw" | sed -E 's/FORMAT[[:space:]]+[A-Za-z]+[[:space:]]*;?[[:space:]]*$//I')
    echo "$raw
FORMAT Null"
}

SQL_A=$(prep_sql "$SQL_FILE_A")
SQL_B=$(prep_sql "$SQL_FILE_B")

QID_PREFIX="cmp-$(date +%s%N)-$RANDOM"

echo "[compare] $LABEL_A vs $LABEL_B, $RUNS interleaved runs each" >&2

# Warm up both (not measured)
curl -sS --data-binary "$SQL_A" "${CH_URL}?database=${CH_DB:-default}&query_id=${QID_PREFIX}-warmup-a" >/dev/null
curl -sS --data-binary "$SQL_B" "${CH_URL}?database=${CH_DB:-default}&query_id=${QID_PREFIX}-warmup-b" >/dev/null
echo "[compare] warm-up done" >&2

declare -a QIDS_A QIDS_B
for i in $(seq 1 "$RUNS"); do
    QID_A="${QID_PREFIX}-a-${i}"
    curl -sS --data-binary "$SQL_A" "${CH_URL}?database=${CH_DB:-default}&query_id=${QID_A}" >/dev/null
    QIDS_A+=("$QID_A")

    QID_B="${QID_PREFIX}-b-${i}"
    curl -sS --data-binary "$SQL_B" "${CH_URL}?database=${CH_DB:-default}&query_id=${QID_B}" >/dev/null
    QIDS_B+=("$QID_B")

    echo "[compare] round $i/$RUNS done" >&2
done

curl -sS --data-binary 'SYSTEM FLUSH LOGS' "${CH_URL_PRIV}?database=${CH_DB:-default}" >/dev/null 2>&1 || true

fetch_metrics() {
    local -n qids_ref=$1
    local qid_list
    qid_list=$(printf "'%s'," "${qids_ref[@]}" | sed 's/,$//')
    curl -sS --data-binary "
SELECT query_duration_ms, memory_usage, read_rows, read_bytes,
       ProfileEvents['OSCPUVirtualTimeMicroseconds'] AS cpu_virt_us
FROM system.query_log
WHERE query_id IN (${qid_list}) AND type = 'QueryFinish'
ORDER BY event_time
FORMAT JSONEachRow" "${CH_URL_PRIV}?database=${CH_DB:-default}"
}

METRICS_A=$(fetch_metrics QIDS_A)
METRICS_B=$(fetch_metrics QIDS_B)

if grep -q 'ACCESS_DENIED\|Not enough privileges' <<<"$METRICS_A$METRICS_B"; then
    echo "[compare] ERROR: cannot read system.query_log — need CLICKHOUSE_USERNAME with SELECT on system.query_log for significance testing." >&2
    exit 1
fi

echo "[compare] --- $LABEL_A runs ---" >&2
echo "$METRICS_A" >&2
echo "[compare] --- $LABEL_B runs ---" >&2
echo "$METRICS_B" >&2

extract_csv() {
    local json="$1" field="$2"
    echo "$json" | python3 -c "
import sys, json
vals = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    vals.append(str(json.loads(line)['$field']))
print(','.join(vals))
"
}

WALL_A=$(extract_csv "$METRICS_A" query_duration_ms)
WALL_B=$(extract_csv "$METRICS_B" query_duration_ms)
MEM_A=$(extract_csv "$METRICS_A" memory_usage)
MEM_B=$(extract_csv "$METRICS_B" memory_usage)
READROWS_A=$(extract_csv "$METRICS_A" read_rows)
READROWS_B=$(extract_csv "$METRICS_B" read_rows)

echo
echo "=== wall_ms significance ==="
python3 "$SCRIPT_DIR/significance.py" "$LABEL_A" "$WALL_A" "$LABEL_B" "$WALL_B" "$ALPHA"

echo
echo "=== memory_usage significance ==="
python3 "$SCRIPT_DIR/significance.py" "$LABEL_A" "$MEM_A" "$LABEL_B" "$MEM_B" "$ALPHA"

echo
echo "=== read_rows (informational, usually deterministic) ==="
echo "$LABEL_A: $READROWS_A"
echo "$LABEL_B: $READROWS_B"
