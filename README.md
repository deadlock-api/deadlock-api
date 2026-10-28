# Deadlock API

Monorepo for the [Deadlock API](https://deadlock-api.com) project.

## Structure

- **[`api-crates/`](api-crates/)** - Rust crates of the API: [`api/`](api-crates/api/), the Axum backend serving game
  data, analytics, leaderboards, and more, and [`rate-limit/`](api-crates/rate-limit/), its sliding-window rate limiter
- **[`website/`](website/)** - React frontend (Vite + React Router) for the Deadlock API website
- **[`worker-crates/`](worker-crates/)** - Rust microservices for data ingestion, scraping, and pipeline processing,
  plus the database migrations
- **[`live-events/`](live-events/)** - Rust service for live match event streaming via SSE
- **[`util-crates/`](util-crates/)** - Rust libraries shared by the services, among them:
  - [`valveprotos/`](util-crates/valveprotos/) - Rust bindings for the Steam and Deadlock protobufs (formerly
    `valveprotos-rs`)
  - [`haste/`](util-crates/haste/) - Source 2 demo and broadcast parser (formerly `deadlock-api/haste`), including
    the `dungers` bit buffer, varint and char cursor crates it uses (formerly `deadlock-api/dungers`)
  - [`demofusion/`](util-crates/demofusion/) - SQL queries (Apache DataFusion) over demo files and live broadcasts,
    parsed with `haste`
  - [`keyvalues/`](util-crates/keyvalues/) - parsers for Valve's KV3 (`.vdata`) and localization files
  - [`crosshair/`](util-crates/crosshair/) - crosshair share codes (`DL.…`) to settings and back, and settings to PNG
  - `telemetry`, `service-utils`, `steam-id`, `steam-proxy`, `db-clients`, `clickhouse-utils` and `assets-client`,
    the service plumbing that used to live in one `common` crate

All Rust crates are members of one cargo workspace (`Cargo.toml` at the repo root), sharing a
single `Cargo.lock` and `target/`. Build or run any of them from the root with `cargo <cmd> -p <package>`.
Docker images for the Rust services are built with the repo root as context, e.g.
`docker build -f api-crates/api/Dockerfile .`.

## Getting Started

### API

```bash
cd api-crates/api
cp .env.example .env
# Edit .env with your credentials
cargo run
```

### Website

```bash
cd website
cp .env.example .env
pnpm install
pnpm dev
```

### Workers

```bash
# Set up worker-crates/.env with your credentials
cd worker-crates
cargo run -p <service-name>
```

### Live Events

```bash
cd live-events
cp .env.example .env
# Edit .env with your credentials
cargo run
```

See [`live-events/README.md`](live-events/README.md) for full documentation.

## License

MIT
