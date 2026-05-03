#!/usr/bin/env bash
# Run a single SQL query against ClickHouse and stream the result.
# Usage: run_query.sh <env_path> <sql_file> [format]
# Default format: TSVWithNames. Use 'Null' to skip result transfer.

set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "usage: run_query.sh <env_path> <sql_file> [format=TSVWithNames]" >&2
    exit 1
fi

ENV_PATH="$1"
SQL_FILE="$2"
FORMAT="${3:-TSVWithNames}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_load_env.sh
source "$SCRIPT_DIR/_load_env.sh" "$ENV_PATH"

# Append FORMAT only if the file doesn't already specify one.
if grep -qiE 'FORMAT[[:space:]]+[A-Za-z]+' "$SQL_FILE"; then
    SQL=$(cat "$SQL_FILE")
else
    SQL="$(cat "$SQL_FILE")
FORMAT $FORMAT"
fi

curl -sS --data-binary "$SQL" "${CH_URL}?database=${CH_DB:-default}"
