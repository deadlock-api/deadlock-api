FROM rust:1.98-slim-trixie AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev pkg-config cmake build-essential clang curl git mold \
    && rm -rf /var/lib/apt/lists/*
ENV SQLX_OFFLINE=true
WORKDIR /app
# Tune codegen for the deploy host (AMD EPYC 7502P, Zen 2). Includes the mold
# linker flag from .cargo/config.toml because RUSTFLAGS replaces, not extends,
# the target.cfg rustflags from cargo config. Use the short-name form so it
# works for build scripts linked via gcc as well as the final target.
ENV RUSTFLAGS="-Clink-arg=-fuse-ld=mold -Ctarget-cpu=znver2"
# Build context is the repo root (one cargo workspace); build only the packages under tools/.
# The target cache mount is shared with the other Rust images, so copy out only the tools'
# own binaries (named after their packages; library packages produce none).
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    cargo build --release --locked $(for m in tools/*/Cargo.toml; do sed -n 's/^name = "\(.*\)"/-p \1/p' "$m"); done) \
    && mkdir -p /tmp/release-bin \
    && for m in tools/*/Cargo.toml; do \
         name=$(sed -n 's/^name = "\(.*\)"/\1/p' "$m"); \
         if [ -f "/app/target/release/$name" ]; then cp "/app/target/release/$name" /tmp/release-bin/; fi; \
       done

# We do not need the Rust toolchain to run the binary!
# TLS is rustls (nothing links OpenSSL), so the runtime only needs the CA bundle.
FROM debian:trixie-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# One image holds every tool (CI pushes the same image once per component), so there is
# no ENTRYPOINT: each deployment names its binary as the container command.
COPY --from=builder /tmp/release-bin/* /usr/local/bin
