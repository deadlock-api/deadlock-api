ARG EXE_NAME=deadlock-api-rust

FROM rust:1.93-slim-trixie AS chef
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev sccache ca-certificates gcc libssl-dev pkg-config cmake build-essential clang curl mold
RUN cargo install --locked cargo-chef
ENV RUSTC_WRAPPER=sccache SCCACHE_DIR=/sccache
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
ARG EXE_NAME
WORKDIR /app
COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=$SCCACHE_DIR,sharing=locked \
    cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=$SCCACHE_DIR,sharing=locked \
    cargo build --release --bin ${EXE_NAME}

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
ARG EXE_NAME
ENV exe_name=$EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/${EXE_NAME} /usr/local/bin
ENTRYPOINT "/usr/local/bin/${exe_name}"
