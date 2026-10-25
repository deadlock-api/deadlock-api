use crate::parser::MAX_NESTING;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("unknown char {0}")]
    UnknownChar(char),
    #[error("unexpected eof")]
    UnexpectedEof,
    #[error("unexpected token at {0}")]
    UnexpectedToken(u16),
    #[error("type nests more than {MAX_NESTING} templates, arrays and pointers")]
    TooDeep,
}
