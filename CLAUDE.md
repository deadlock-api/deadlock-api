# Deadlock API

Monorepo for the main game data Rust API and website of https://deadlock-api.com

```
api/ # rust api, served in production at https://api.deadlock-api.com
tools/ # rust microservices for data ingestion and scraping
live-events/ # rust service for live match event streaming
valveprotos/ # rust protobuf bindings for steam/deadlock (formerly valveprotos-rs)
haste/ # source 2 demo/broadcast parser (formerly deadlock-api/haste); crates/dungers* are its bitbuf/varint/charsor primitives (formerly deadlock-api/dungers)
website/ # tanstack start website, using generated openapi SDKs hitting the api
```

All Rust crates form one cargo workspace rooted at `Cargo.toml` (single `Cargo.lock`, `target/`,
`.cargo/`, `rust-toolchain.toml`, `rustfmt.toml`, sqlx offline cache in `.sqlx/`). Rust Dockerfiles
build with the repo root as context.

## Twin implementations

The crosshair renderer exists twice, in Rust (`api/src/services/crosshair/render.rs`, used by the API) and as a
line-by-line TypeScript port (`website/src/lib/crosshair-render.ts`, used by the crosshair editor). A change to one must
be made to the other in the same commit. The TypeScript test checks pixel parity against the Rust fixture PNGs.

## Website UI: strict laws

Any change that touches UI under `website/` is bound by **The 20 Laws of React Design Systems** in
`website/CLAUDE.md` (canonical copy: `website/docs/design-system-laws.md`). They are strict laws, not guidelines:
read them before touching `website/src`, pass them on to every subagent you start, and never work around one.
