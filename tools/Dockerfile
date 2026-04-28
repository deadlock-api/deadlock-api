FROM rust:1.95-slim-trixie AS builder
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
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    cargo build --release --all-features \
    && mkdir -p /tmp/release-bin \
    && find /app/target/release -maxdepth 1 -type f -executable -exec cp {} /tmp/release-bin/ \;

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy only the compiled binaries, not any other build artifacts
COPY --from=builder /tmp/release-bin/* /usr/local/bin
