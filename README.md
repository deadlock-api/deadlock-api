# Deadlock API

Monorepo for the [Deadlock API](https://deadlock-api.com) project.

## Structure

- **[`api/`](api/)** - Rust API backend (Axum) serving game data, analytics, leaderboards, and more
- **[`website/`](website/)** - React frontend (Vite + React Router) for the Deadlock API website
- **[`tools/`](tools/)** - Rust microservices for data ingestion, scraping, and pipeline processing
- **[`live-events/`](live-events/)** - Rust service for live match event streaming via SSE
- **[`valveprotos/`](valveprotos/)** - Rust bindings for the Steam and Deadlock protobufs (formerly `valveprotos-rs`)
- **[`haste/`](haste/)** - Source 2 demo and broadcast parser (formerly `deadlock-api/haste`), including the
  `dungers` bit buffer, varint and char cursor crates it uses (formerly `deadlock-api/dungers`)

All Rust crates are members of one cargo workspace (`Cargo.toml` at the repo root), sharing a
single `Cargo.lock` and `target/`. Build or run any of them from the root with `cargo <cmd> -p <package>`.
Docker images for the Rust services are built with the repo root as context, e.g.
`docker build -f api/Dockerfile .`.

## Getting Started

### API

```bash
cd api
cp .env.example .env
# Edit .env with your credentials
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
# Set up tools/.env with your credentials
cd tools
cargo run -p <service-name>
```

See [`tools/README.md`](tools/README.md) for full documentation.

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
