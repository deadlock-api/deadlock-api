FROM rust as builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gcc libssl-dev pkg-config protobuf-compiler cmake build-essential

WORKDIR /app

COPY ./src  ./src/
COPY Cargo.toml Cargo.lock ./

RUN cargo build --release

FROM ubuntu

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev openssl libc6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/salt-scraper .

CMD ["./salt-scraper"]
