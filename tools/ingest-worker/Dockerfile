FROM rust:slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gcc libssl-dev pkg-config

WORKDIR /app

COPY ./src  ./src/
COPY Cargo.toml Cargo.lock ./

RUN cargo build --release

CMD ["./target/release/ingest-worker"]
