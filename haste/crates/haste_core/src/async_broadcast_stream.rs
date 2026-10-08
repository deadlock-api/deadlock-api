//! Async broadcast stream for parsing GOTV HTTP broadcast packets.
//!
//! Broadcast packets have a different command header format than demo files:
//! - Demo file: varint-encoded `cmd`, `tick`, `body_size`
//! - Broadcast: fixed-size 1 byte `cmd` + 4 bytes `tick` + 1 byte unknown + 4 bytes `body_size`

// `core::io::Cursor` is unstable on stable toolchains, so std imports are used here.
#![allow(clippy::std_instead_of_core)]

use std::io::Cursor;

use tokio::io::{AsyncRead, AsyncReadExt};

use crate::async_demostream::AsyncDemoStream;
use crate::demostream::{
    BROADCAST_CMD_HEADER_SIZE, CmdFormat, CmdHeader, ReadCmdError, ReadCmdHeaderError,
    parse_broadcast_cmd_header,
};

pub struct AsyncBroadcastStream<R: AsyncRead + Unpin + Send> {
    reader: R,
    buffer: Vec<u8>,
}

impl<R: AsyncRead + Unpin + Send> AsyncBroadcastStream<R> {
    pub fn new(reader: R) -> Self {
        Self {
            reader,
            buffer: Vec::with_capacity(64 * 1024),
        }
    }
}

impl AsyncBroadcastStream<Cursor<Vec<u8>>> {
    #[must_use]
    pub fn from_bytes(data: Vec<u8>) -> Self {
        Self::new(Cursor::new(data))
    }
}

impl<R: AsyncRead + Unpin + Send> AsyncDemoStream for AsyncBroadcastStream<R> {
    const CMD_FORMAT: CmdFormat = CmdFormat::Broadcast;

    async fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        let mut buf = [0u8; BROADCAST_CMD_HEADER_SIZE];
        self.reader.read_exact(&mut buf).await?;
        parse_broadcast_cmd_header(buf)
    }

    async fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        let size = cmd_header.body_size as usize;
        self.buffer.resize(size, 0);
        self.reader.read_exact(&mut self.buffer).await?;
        Ok(&self.buffer)
    }

    fn start_position(&self) -> u64 {
        0 // No demo header in broadcasts
    }
}
