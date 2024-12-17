use crate::state::LoadAppStateError;
use std::fmt::Display;
use std::io;

#[derive(Debug)]
pub enum ApplicationError {
    IO(io::Error),
    State(LoadAppStateError),
}

impl From<io::Error> for ApplicationError {
    fn from(e: io::Error) -> Self {
        Self::IO(e)
    }
}

impl From<LoadAppStateError> for ApplicationError {
    fn from(e: LoadAppStateError) -> Self {
        Self::State(e)
    }
}

impl Display for ApplicationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IO(e) => write!(f, "IO error: {}", e),
            Self::State(e) => write!(f, "State error: {}", e),
        }
    }
}
