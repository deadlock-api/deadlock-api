ARG CARGO_SONIC_VERSION=0.1.4
ARG CARGO_SONIC_TARGET_CPUS=x86-64-v3,x86-64-v4,znver4

FROM rust:1.95-slim-trixie AS builder
ARG CARGO_SONIC_VERSION
ARG CARGO_SONIC_TARGET_CPUS
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev pkg-config cmake build-essential clang curl git mold \
    && rm -rf /var/lib/apt/lists/*
ENV SQLX_OFFLINE=true
WORKDIR /app

# Install cargo-sonic for building Linux CPU-dispatched fat binaries.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo install --locked cargo-sonic@${CARGO_SONIC_VERSION}

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    ARCH="$(dpkg --print-architecture)" \
    && mkdir -p /tmp/release-bin \
    && case "$ARCH" in \
         amd64) \
           cargo sonic --target-cpus="${CARGO_SONIC_TARGET_CPUS}" build --release --all-features \
           && find /app/target/sonic/*/release -maxdepth 1 -type f -executable -exec cp {} /tmp/release-bin/ \; ;; \
         *) \
           cargo build --release --all-features \
           && find /app/target/release -maxdepth 1 -type f -executable -exec cp {} /tmp/release-bin/ \; ;; \
       esac

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy only the compiled binaries, not any other build artifacts
COPY --from=builder /tmp/release-bin/* /usr/local/bin
