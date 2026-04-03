#!/usr/bin/env bash
set -euo pipefail

echo "=== Deadlock API Dev Container Setup ==="

# Source environment variables
set -a
source /workspaces/deadlock-api/.devcontainer/.env
set +a

# 1. Pre-download Rust crate registry in background
echo ">>> Fetching Rust dependencies..."
cd /workspaces/deadlock-api/api
cargo fetch &
CARGO_PID=$!

# 2. Install website dependencies
echo ">>> Installing website dependencies..."
cd /workspaces/deadlock-api/website
pnpm install --frozen-lockfile

# 3. Run database migrations
echo ">>> Running database migrations..."
bash /workspaces/deadlock-api/.devcontainer/scripts/run-migrations.sh

# 4. Create ClickHouse restricted user
echo ">>> Creating ClickHouse restricted user..."
clickhouse-client --host clickhouse --user default --password "$CLICKHOUSE_PASSWORD" \
  --multiquery < /workspaces/deadlock-api/api/tests/data/clickhouse/_restricted_user.sql

# 5. Seed PostgreSQL with test data
echo ">>> Seeding PostgreSQL..."
bash /workspaces/deadlock-api/.devcontainer/scripts/seed-postgres.sh

# 6. Create S3 buckets on rustfs
echo ">>> Creating S3 buckets on rustfs..."
curl -sf -X PUT "http://rustfs:9000/test" \
  -H "Authorization: AWS devcontainer-access-key:" || true
curl -sf -X PUT "http://rustfs:9000/test-cache" \
  -H "Authorization: AWS devcontainer-access-key:" || true

# 7. Load sample data from S3 parquet dumps
echo ">>> Loading sample data from S3 parquet dumps (10%)..."
python3 /workspaces/deadlock-api/.devcontainer/scripts/load-sample-data.py

# 8. Load match metadata sample into local S3
echo ">>> Loading match metadata sample into local S3..."
python3 /workspaces/deadlock-api/.devcontainer/scripts/load-metadata-sample.py

# 9. Create website .env.local for local development
cat > /workspaces/deadlock-api/website/.env.local << 'ENVEOF'
VITE_API_BASE_URL=http://localhost:3000
VITE_ASSETS_BASE_URL=https://assets.deadlock-api.com
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
VITE_AI_ASSISTANT_API_URL=
VITE_PUBLIC_POSTHOG_TOKEN=
ENVEOF

# 10. Wait for cargo fetch to finish
echo ">>> Waiting for Rust dependency fetch to complete..."
wait $CARGO_PID

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the API:      cd api && cargo run"
echo "To start the website:   cd website && pnpm dev --host"
echo ""
