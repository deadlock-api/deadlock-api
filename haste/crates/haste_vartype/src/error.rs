use crate::parser::MAX_NESTING;

#[derive(thiserror::Error, Debug)]
pub enum VarTypeError {
    #[error("input is longer than {} bytes", u16::MAX)]
    TooLong(#[from] core::num::TryFromIntError),
    #[error("invalid array length at {at}")]
    InvalidLength {
        at: u16,
        #[source]
        source: core::num::ParseIntError,
    },
    #[error("unknown char {0}")]
    UnknownChar(char),
    #[error("unexpected eof")]
    UnexpectedEof,
    #[error("unexpected token at {0}")]
    UnexpectedToken(u16),
    #[error("type nests more than {MAX_NESTING} templates, arrays and pointers")]
    TooDeep,
}
