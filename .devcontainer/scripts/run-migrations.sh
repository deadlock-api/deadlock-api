#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="/workspaces/deadlock-api/tools/migrations"

echo "  Running ClickHouse migrations..."
for f in $(find "$MIGRATIONS_DIR/clickhouse/" -name '*.sql' | sort); do
  echo "    Applying: $(basename "$f")"
  clickhouse-client --host clickhouse --user "$CLICKHOUSE_USERNAME" \
    --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DBNAME" \
    --multiquery < "$f"
done

echo "  Running PostgreSQL migrations..."
for f in $(find "$MIGRATIONS_DIR/postgres/" -name '*.sql' | sort); do
  echo "    Applying: $(basename "$f")"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U "$POSTGRES_USERNAME" \
    -d "$POSTGRES_DBNAME" -f "$f"
done
