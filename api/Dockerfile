ARG EXE_NAME=deadlock-api-rust

FROM rust:1.95-slim-trixie AS builder
ARG EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev pkg-config cmake build-essential clang curl mold \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    cargo build --release --bin ${EXE_NAME} \
    && cp /app/target/release/${EXE_NAME} /usr/local/bin/${EXE_NAME}

# We do not need the Rust toolchain to run the binary!
FROM debian:trixie-slim AS runtime
ARG EXE_NAME
ENV exe_name=$EXE_NAME
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/local/bin/${EXE_NAME} /usr/local/bin/
COPY model/xgb.onnx.zst /app/model/xgb.onnx.zst
ENTRYPOINT ["/usr/local/bin/deadlock-api-rust"]
