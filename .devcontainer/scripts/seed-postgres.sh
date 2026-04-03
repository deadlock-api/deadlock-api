#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/workspaces/deadlock-api/api/tests/data/postgres"

echo "  Seeding PostgreSQL with test data..."
for f in $(find "$DATA_DIR" -name '*.sql' | sort); do
  echo "    Loading: $(basename "$f")"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U "$POSTGRES_USERNAME" \
    -d "$POSTGRES_DBNAME" -f "$f" 2>&1 || true
done
