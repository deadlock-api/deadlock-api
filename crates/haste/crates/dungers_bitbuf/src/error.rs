#[derive(thiserror::Error, Debug)]
pub enum BitError {
    #[error("was about to overrun a buffer")]
    Overflow,
    #[error("malformed varint")]
    MalformedVarint,
    #[error("buffer too small")]
    BufferTooSmall,
    #[error(transparent)]
    TryFromIntError(#[from] core::num::TryFromIntError),
}
