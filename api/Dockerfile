ARG EXE_NAME=deadlock-api-rust

FROM rust:1.99-slim-trixie AS builder
ARG EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev pkg-config cmake build-essential clang curl mold git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Tune codegen for the deploy host (AMD EPYC 7502P, Zen 2). Includes the mold
# linker flag from .cargo/config.toml because RUSTFLAGS replaces, not extends,
# the target.cfg rustflags from cargo config. Use the short-name form so it
# works for build scripts linked via gcc as well as the final target.
ENV RUSTFLAGS="-Clink-arg=-fuse-ld=mold -Ctarget-cpu=znver2"
# Build context is the repo root (one cargo workspace).
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    cargo build --release --locked --package deadlock-api-rust --bin ${EXE_NAME} \
    && cp /app/target/release/${EXE_NAME} /usr/local/bin/${EXE_NAME}

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
ARG EXE_NAME
ENV exe_name=$EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 curl \
    && rm -rf /var/lib/apt/lists/*
# Run unprivileged. The writable state dirs are pre-created so fresh volumes mounted there
# inherit the ownership.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin api \
    && mkdir -p /var/lib/deadlock-api/steam_search_index /var/lib/deadlock-api/ch_cache \
    && chown -R api:api /var/lib/deadlock-api
WORKDIR /app
COPY --from=builder /usr/local/bin/${EXE_NAME} /usr/local/bin/
USER api
ENTRYPOINT ["/usr/local/bin/deadlock-api-rust"]
