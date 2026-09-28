//! Async broadcast stream for parsing GOTV HTTP broadcast packets.
//!
//! Broadcast packets have a different command header format than demo files:
//! - Demo file: varint-encoded `cmd`, `tick`, `body_size`
//! - Broadcast: fixed-size 1 byte `cmd` + 4 bytes `tick` + 1 byte unknown + 4 bytes `body_size`

// `core::io::Cursor` is unstable on stable toolchains, so std imports are used here.
#![allow(clippy::std_instead_of_core)]

use std::io::Cursor;

use prost::Message;
use tokio::io::{AsyncRead, AsyncReadExt};
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};

use crate::async_demostream::AsyncDemoStream;
use crate::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};

const BROADCAST_CMD_HEADER_SIZE: u8 = 10; // 1 + 4 + 1 + 4

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
    async fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        let mut buf = [0u8; BROADCAST_CMD_HEADER_SIZE as usize];
        self.reader.read_exact(&mut buf).await?;

        let cmd_byte = buf[0];
        let cmd = EDemoCommands::try_from(i32::from(cmd_byte)).map_err(|_| {
            ReadCmdHeaderError::UnknownCmd {
                raw: u32::from(cmd_byte),
                uncompressed: u32::from(cmd_byte),
            }
        })?;

        let tick = i32::from_le_bytes([buf[1], buf[2], buf[3], buf[4]]);
        // buf[5] is unknown/unused
        let body_size = u32::from_le_bytes([buf[6], buf[7], buf[8], buf[9]]);

        Ok(CmdHeader {
            cmd,
            body_compressed: false, // Broadcast packets are not compressed
            tick,
            body_size,
            size: BROADCAST_CMD_HEADER_SIZE,
        })
    }

    async fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        let size = cmd_header.body_size as usize;
        self.buffer.resize(size, 0);
        self.reader.read_exact(&mut self.buffer).await?;
        Ok(&self.buffer)
    }

    fn decode_cmd_send_tables(data: &[u8]) -> Result<CDemoSendTables, DecodeCmdError> {
        // Broadcast format: skip first 4 bytes, then rest is the data
        Ok(CDemoSendTables {
            data: Some(data[4..].to_vec()),
        })
    }

    fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError> {
        CDemoClassInfo::decode(data).map_err(DecodeCmdError::DecodeProtobufError)
    }

    fn decode_cmd_packet(data: &[u8]) -> Result<CDemoPacket, DecodeCmdError> {
        Ok(CDemoPacket {
            data: Some(data.to_vec()),
        })
    }

    fn decode_cmd_full_packet(data: &[u8]) -> Result<CDemoFullPacket, DecodeCmdError> {
        // Broadcast /full packets contain CDemoFullPacket
        // The data format appears to be raw packet data, similar to CDemoPacket
        Ok(CDemoFullPacket {
            string_table: None,
            packet: Some(CDemoPacket {
                data: Some(data.to_vec()),
            }),
        })
    }

    fn start_position(&self) -> u64 {
        0 // No demo header in broadcasts
    }
}
