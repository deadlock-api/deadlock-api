#!/usr/bin/env bash
# Check whether two SQL queries produce equivalent result sets.
# Wraps each in cityHash64(groupArray(*)) over an ORDER-BY'd subquery and
# compares the resulting hashes.
#
# Usage: equiv.sh <env_path> <sql_a> <sql_b>
#
# Prints both hashes and "EQUIVALENT" / "DIFFER" on stderr; exits non-zero
# on differ.
#
# Caveats — when results contain approximate aggregates (uniq*, quantile*,
# topK, etc.) hashes will rarely match exactly even with equivalent queries.
# Round those columns or compare them separately.

set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo "usage: equiv.sh <env_path> <sql_a> <sql_b>" >&2
    exit 1
fi

ENV_PATH="$1"
SQL_A="$2"
SQL_B="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_load_env.sh
source "$SCRIPT_DIR/_load_env.sh" "$ENV_PATH"

_strip_format() {
    sed -E 's/FORMAT[[:space:]]+[A-Za-z]+[[:space:]]*;?[[:space:]]*$//I'
}

_hash_query() {
    local sql_file="$1"
    local stripped
    stripped=$(cat "$sql_file" | _strip_format)
    cat <<EOF
SELECT cityHash64(groupArray(t)) AS h, count() AS n
FROM (
    SELECT tuple(*) AS t
    FROM ($stripped)
    ORDER BY t
)
FORMAT TabSeparated
EOF
}

H_A=$(_hash_query "$SQL_A" | curl -sS --data-binary @- "${CH_URL}?database=${CH_DB:-default}")
H_B=$(_hash_query "$SQL_B" | curl -sS --data-binary @- "${CH_URL}?database=${CH_DB:-default}")

echo "A: $H_A" >&2
echo "B: $H_B" >&2

if [[ "$H_A" == "$H_B" ]]; then
    echo "EQUIVALENT" >&2
    exit 0
else
    echo "DIFFER" >&2
    exit 2
fi
