# Deadlock API

Monorepo for the main game data Rust API and website of https://deadlock-api.com

```
api/ # rust api, served in production at https://api.deadlock-api.com
workers/ # rust microservices for data ingestion and scraping; migrations/ holds the clickhouse + postgres migrations
live-events/ # rust service for live match event streaming
crates/ # libraries shared by the services:
  telemetry/ # console logs + otlp export (all services); feature `prometheus` for the workers' scrape endpoint, `process-memory` for memory-by-owner gauges from /proc/self
  service-utils/ # env config, graceful shutdown, retries with backoff, shared http clients
  steam-id/ # SteamId: a player's account id <-> SteamID64/Steam3/Steam2; feature `serde` has the deserializers for account id query params
  steam-proxy/ # sv-proxy request/response types and client
  crosshair/ # crosshair share codes (DL.…) to settings and back, and settings to png; used by the api's /crosshair routes and, as wasm (website/wasm/crosshair), the website's crosshair editor
  db-clients/ # clickhouse/postgres/redis/s3/file-cache connections from env, shared postgres queries, redis single-replica lease
  clickhouse-utils/ # inserts, retrying batch inserter, batched key lookups (BatchQuery), match id bounds, error classification; feature `admission` for the pressure-adaptive query limiter, `cache` for the memory + shared disk query result caches (both used by the api)
  assets-client/ # heroes and ranked seasons from the public asset endpoints
  rate-limit/ # generic sliding-window rate limiter (caller-defined scopes, per-request costs, Redis or in-memory store), used by the api
  game-assets/ # the versioned game files on R2 (.vdata, css, localization) to the api's /v1/assets JSON; features `utoipa`/`graphql`/`schemars` add the api's derives
  demofusion/ # sql (datafusion) over demo files and live broadcasts, parsed with haste; used by the api's /matches/demo routes
  keyvalues/ # parsers for valve's kv3 (.vdata) and localization text files, used by game-assets
  valveprotos/ # rust protobuf bindings for steam/deadlock (formerly valveprotos-rs)
  haste/ # source 2 demo/broadcast parser (formerly deadlock-api/haste); crates/dungers* are its bitbuf/varint/charsor primitives (formerly deadlock-api/dungers)
website/ # tanstack start website, using generated openapi SDKs hitting the api
website/wasm/ # rust crates compiled to wasm for the website (hero build codes on valveprotos, crosshairs on crates/crosshair); abi/ is their shared ABI
```

All Rust crates form one cargo workspace rooted at `Cargo.toml` (single `Cargo.lock`, `target/`,
`.cargo/`, `rust-toolchain.toml`, `rustfmt.toml`, sqlx offline cache in `.sqlx/`). Rust Dockerfiles
build with the repo root as context.

## Rust lints: no panics

All crates inherit the strict `[workspace.lints]` in `Cargo.toml`. Every level is `deny`, so `cargo clippy` fails
without `-D warnings`. `clippy.toml` also bans the `assert!` macros and panicking std methods. Production code
must not be able to panic: no `unwrap`/`expect`, `panic!`-family macros, indexing/slicing, unchecked arithmetic or
asserts. Use `?`, `get`, slice patterns, and `checked_`/`saturating_`/`wrapping_` ops. Never silence a panic lint with
`allow`/`expect`. Tests are exempt through the `#![cfg_attr(test, allow(...))]` block at each crate root, which every
new crate root needs too. Other lints may get an item-level `#[expect(lint, reason = "...")]`. Every allow/expect needs
a `reason`.

## Website UI: strict laws

Any change that touches UI under `website/` is bound by **The 20 Laws of React Design Systems** in
`website/CLAUDE.md` (canonical copy: `website/docs/design-system-laws.md`). They are strict laws, not guidelines:
read them before touching `website/src`, pass them on to every subagent you start, and never work around one.
