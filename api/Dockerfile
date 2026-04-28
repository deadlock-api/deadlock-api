ARG EXE_NAME=deadlock-api-rust
ARG CARGO_SONIC_VERSION=0.1.4
ARG CARGO_SONIC_TARGET_CPUS=x86-64-v3,x86-64-v4,znver4

FROM rust:1.95-slim-trixie AS builder
ARG EXE_NAME
ARG CARGO_SONIC_VERSION
ARG CARGO_SONIC_TARGET_CPUS
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev pkg-config cmake build-essential clang curl mold \
    && rm -rf /var/lib/apt/lists/*
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
    && case "$ARCH" in \
         amd64) \
           cargo sonic --target-cpus="${CARGO_SONIC_TARGET_CPUS}" build --release --bin ${EXE_NAME} \
           && cp /app/target/sonic/*/release/${EXE_NAME} /usr/local/bin/${EXE_NAME} ;; \
         *) \
           cargo build --release --bin ${EXE_NAME} \
           && cp /app/target/release/${EXE_NAME} /usr/local/bin/${EXE_NAME} ;; \
       esac

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
ARG EXE_NAME
ARG ORT_VERSION=1.25.0
ENV exe_name=$EXE_NAME
ENV ORT_DYLIB_PATH=/usr/local/lib/libonnxruntime.so
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 curl \
    && ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in \
         amd64) ORT_ARCH=x64 ;; \
         arm64) ORT_ARCH=aarch64 ;; \
         *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}.tgz" \
        | tar -xz -C /tmp \
    && cp "/tmp/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}/lib/libonnxruntime.so.${ORT_VERSION}" /usr/local/lib/libonnxruntime.so \
    && rm -rf "/tmp/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}" \
    && ldconfig \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/local/bin/${EXE_NAME} /usr/local/bin/
COPY model/xgb.onnx.zst /app/model/xgb.onnx.zst
ENTRYPOINT ["/usr/local/bin/deadlock-api-rust"]
