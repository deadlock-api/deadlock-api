use axum::response::sse::Event;
use haste::broadcast::BroadcastHttpClientError;
use haste::demofile::DemoHeaderError;
use haste::demostream::{DecodeCmdError, ReadCmdError, ReadCmdHeaderError};
use haste::flattenedserializers::FlattenedSerializersError;
use tokio::sync::mpsc::error::SendError;

#[derive(thiserror::Error, Debug)]
pub(crate) enum DemoParseError {
    #[error(transparent)]
    Send(#[from] SendError<Event>),
    #[error(transparent)]
    Broadcast(#[from] BroadcastHttpClientError<reqwest::Error>),
    #[error(transparent)]
    DemoHeader(#[from] DemoHeaderError),
    #[error(transparent)]
    ReadCmdHeader(#[from] ReadCmdHeaderError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    DecodeCmd(#[from] DecodeCmdError),
    #[error(transparent)]
    ReadCmd(#[from] ReadCmdError),
    #[error(transparent)]
    ParseInt(#[from] core::num::ParseIntError),
    #[error(transparent)]
    Protobuf(#[from] prost::DecodeError),
    #[error(transparent)]
    FlattenedSerializers(#[from] FlattenedSerializersError),
    #[error(transparent)]
    SSEEvent(#[from] axum::Error),
}
