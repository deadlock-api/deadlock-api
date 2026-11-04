# syntax=docker/dockerfile:1
ARG EXE_NAME=deadlock-live-events

FROM rust:1.99-slim-trixie AS builder
ARG EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev pkg-config cmake build-essential curl \
    && rm -rf /var/lib/apt/lists/*
# sccache caches compiled crates across CI runs (see scripts/docker/with-sccache.sh).
COPY scripts/docker/ /usr/local/lib/docker-build/
RUN /usr/local/lib/docker-build/install-sccache.sh
WORKDIR /app
# Build context is the repo root (one cargo workspace).
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    --mount=type=secret,id=ACTIONS_RESULTS_URL,env=ACTIONS_RESULTS_URL \
    --mount=type=secret,id=ACTIONS_RUNTIME_TOKEN,env=ACTIONS_RUNTIME_TOKEN \
    /usr/local/lib/docker-build/with-sccache.sh cargo build --release --locked --package deadlock-live-events --bin ${EXE_NAME} \
    && cp /app/target/release/${EXE_NAME} /usr/local/bin/${EXE_NAME}

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
ARG EXE_NAME
ENV exe_name=$EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/local/bin/${EXE_NAME} /usr/local/bin
# exec replaces the shell, so the binary runs as PID 1 and receives SIGTERM.
ENTRYPOINT ["/bin/sh", "-c", "exec \"/usr/local/bin/${exe_name}\""]
