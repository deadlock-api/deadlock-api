# Deadlock API

Monorepo for the [Deadlock API](https://deadlock-api.com) project.

## Structure

- **[`api/`](api/)** - Rust API backend (Axum) serving game data, analytics, leaderboards, and more
- **[`website/`](website/)** - React frontend (Vite + React Router) for the Deadlock API website
- **[`tools/`](tools/)** - Rust microservices for data ingestion, scraping, and pipeline processing

## Getting Started (Dev Container)

The easiest way to get a fully working local environment is with the included VS Code Dev Container. It sets up all infrastructure (ClickHouse, PostgreSQL, Redis, S3-compatible storage) and loads a 10% sample of production data automatically.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose on Linux)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) (`ms-vscode-remote.remote-containers`)

### Setup

1. Clone the repository:
   ```bash
   git clone git@github.com:deadlock-api/deadlock-api.git
   cd deadlock-api
   ```

2. Open the project in VS Code:
   ```bash
   code .
   ```

3. When prompted "Reopen in Container", click **Reopen in Container**.
   Alternatively, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Dev Containers: Reopen in Container**.

4. Wait for the initial setup to complete. This runs automatically on first launch and will:
   - Build the dev container image (Rust, Node.js, Python toolchains)
   - Start ClickHouse, PostgreSQL, Redis, and rustfs (S3-compatible storage)
   - Run all database migrations
   - Download and load a 10% sample of production data into ClickHouse
   - Seed PostgreSQL with test data
   - Install website dependencies via pnpm

   The first build takes a while (downloading images, compiling tools). Subsequent starts are fast thanks to cached volumes.

5. Once setup completes, start the services from the integrated terminal:

   **API** (Terminal 1):
   ```bash
   cd api
   cargo run
   ```
   The API will be available at `http://localhost:3000`. The first build will take several minutes.

   **Website** (Terminal 2):
   ```bash
   cd website
   pnpm dev --host
   ```
   The website will be available at `http://localhost:5173`.

### What's included

| Service | Address | Purpose |
|---------|---------|---------|
| API | `localhost:3000` | Rust/Axum backend (started manually) |
| Website | `localhost:5173` | React/Vite frontend (started manually) |
| ClickHouse | `localhost:8123` | Analytics database (HTTP interface) |
| PostgreSQL | `localhost:5432` | Relational database |
| Redis | `localhost:6379` | Cache |
| rustfs (S3) | `localhost:9001` | Object storage |

### Useful commands

```bash
# Check ClickHouse has data
clickhouse-client --host clickhouse -u default --password ijojdmkasd \
  -q "SELECT count() FROM match_info"

# Connect to PostgreSQL
psql -h postgres -U root -d root

# Check Redis
redis-cli -h redis -a sdfdsmplvmdfs ping

# Re-run migrations (if needed)
bash .devcontainer/scripts/run-migrations.sh

# Re-load sample data
python3 .devcontainer/scripts/load-sample-data.py
```

### Troubleshooting

- **Port conflicts**: If ports 3000, 5173, 5432, 6379, 8123, or 9001 are already in use on your host, stop the conflicting services before opening the dev container.
- **Rebuild from scratch**: Open the Command Palette and run **Dev Containers: Rebuild Container Without Cache**. This will recreate the container and re-run all setup steps.
- **Slow first compile**: The first `cargo run` compiles the entire Rust project. Subsequent runs are incremental. Build artifacts are persisted in a Docker volume so they survive container restarts.

## Manual Setup

If you prefer to run without a dev container, you'll need to set up the infrastructure services yourself.

### API

```bash
cd api
cp .env.example .env
# Edit .env with your database credentials
cargo run
```

See [`api/README.md`](api/README.md) for full documentation.

### Website

```bash
cd website
cp .env.example .env
pnpm install
pnpm dev
```

### Tools

```bash
cd tools
# Set up .env with your credentials
cargo run -p <service-name>
```

See [`tools/README.md`](tools/README.md) for full documentation.

## License

MIT
