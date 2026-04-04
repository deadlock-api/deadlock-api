# Deadlock API

Monorepo for the [Deadlock API](https://deadlock-api.com) project.

## Structure

- **[`api/`](api/)** - Rust API backend (Axum) serving game data, analytics, leaderboards, and more
- **[`website/`](website/)** - React frontend (Vite + React Router) for the Deadlock API website
- **[`tools/`](tools/)** - Rust microservices for data ingestion, scraping, and pipeline processing
- **[`live-events/`](live-events/)** - Rust service for live match event streaming via SSE

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
cd tools
# Set up .env with your credentials
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
