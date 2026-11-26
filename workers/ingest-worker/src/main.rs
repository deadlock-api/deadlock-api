//! The ingest worker binary: see the `ingest_worker` library.

#![forbid(unsafe_code)]

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[tokio::main]
async fn main() -> Result<(), ingest_worker::WorkerError> {
    ingest_worker::run().await
}
