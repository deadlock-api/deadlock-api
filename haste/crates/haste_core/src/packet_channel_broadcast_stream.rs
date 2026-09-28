//! Packet-based broadcast stream for parsing GOTV HTTP broadcast packets.
//!
//! This stream receives complete HTTP response packets via a `PacketSource`,
//! enabling integration with various packet sources:
//! - `mpsc::Receiver<Bytes>` for Rust-native channels
//!
//! ## Backpressure
//!
//! Backpressure is achieved through the pull-based design:
//! 1. Parser slow → doesn't call `recv()`
//! 2. Upstream source blocks/waits
//! 3. This naturally throttles the data source

use core::future::Future;
use std::io;

use bytes::Bytes;
use prost::Message;
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};

use crate::async_demostream::AsyncDemoStream;
use crate::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};
use crate::packet_source::PacketSource;

const BROADCAST_CMD_HEADER_SIZE: usize = 10; // 1 + 4 + 1 + 4

/// Broadcast stream that receives packets from a `PacketSource`.
///
/// Each packet is a complete HTTP response body from GOTV broadcast endpoints
/// (`/start`, `/full`, `/delta`). Commands are read from the current packet,
/// and when exhausted, the next packet is awaited from the source.
pub struct PacketChannelBroadcastStream<P: PacketSource> {
    source: P,
    /// Current packet being read (ref-counted, zero-copy slicing).
    current: Bytes,
    /// Read position within current packet.
    offset: usize,
}

impl<P: PacketSource> PacketChannelBroadcastStream<P> {
    /// Create a new stream that receives packets from the given source.
    ///
    /// The stream starts with an empty buffer and will await the first packet
    /// when `read_cmd_header` is called.
    pub fn new(source: P) -> Self {
        Self {
            source,
            current: Bytes::new(),
            offset: 0,
        }
    }

    /// Create a stream with an initial packet already available.
    ///
    /// Useful when the `/start` packet was fetched separately for schema
    /// discovery and should be reused for parsing.
    pub fn with_initial_packet(source: P, initial: Bytes) -> Self {
        Self {
            source,
            current: initial,
            offset: 0,
        }
    }

    /// Ensure we have data to read, fetching the next packet if needed.
    async fn ensure_data(&mut self) -> Result<(), ReadCmdHeaderError> {
        if self.offset >= self.current.len() {
            match self.source.recv().await {
                Some(bytes) => {
                    self.current = bytes;
                    self.offset = 0;
                    Ok(())
                }
                None => {
                    // Source exhausted - no more packets
                    Err(ReadCmdHeaderError::IoError(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "packet source exhausted",
                    )))
                }
            }
        } else {
            Ok(())
        }
    }

    /// Read exactly `n` bytes from the current packet.
    ///
    /// Returns a slice into the packet (zero-copy via Bytes).
    /// Panics if there aren't enough bytes - callers must ensure data is available.
    fn read_bytes(&mut self, n: usize) -> &[u8] {
        let slice = &self.current[self.offset..self.offset + n];
        self.offset += n;
        slice
    }

    /// Check if enough bytes are available in the current packet.
    fn has_bytes(&self, n: usize) -> bool {
        self.offset + n <= self.current.len()
    }
}

impl<P: PacketSource> AsyncDemoStream for PacketChannelBroadcastStream<P> {
    async fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        self.ensure_data().await?;

        if !self.has_bytes(BROADCAST_CMD_HEADER_SIZE) {
            return Err(ReadCmdHeaderError::IoError(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "incomplete command header in packet",
            )));
        }

        let header_bytes = self.read_bytes(BROADCAST_CMD_HEADER_SIZE);

        let cmd_byte = header_bytes[0];
        let cmd = EDemoCommands::try_from(i32::from(cmd_byte)).map_err(|_| {
            ReadCmdHeaderError::UnknownCmd {
                raw: u32::from(cmd_byte),
                uncompressed: u32::from(cmd_byte),
            }
        })?;

        let tick = i32::from_le_bytes([
            header_bytes[1],
            header_bytes[2],
            header_bytes[3],
            header_bytes[4],
        ]);
        // header_bytes[5] is unknown/unused
        let body_size = u32::from_le_bytes([
            header_bytes[6],
            header_bytes[7],
            header_bytes[8],
            header_bytes[9],
        ]);

        Ok(CmdHeader {
            cmd,
            body_compressed: false, // Broadcast packets are not compressed
            tick,
            body_size,
            size: BROADCAST_CMD_HEADER_SIZE as u8,
        })
    }

    fn read_cmd(
        &mut self,
        cmd_header: &CmdHeader,
    ) -> impl Future<Output = Result<&[u8], ReadCmdError>> + Send {
        let size = cmd_header.body_size as usize;
        core::future::ready(if self.has_bytes(size) {
            Ok(self.read_bytes(size))
        } else {
            Err(ReadCmdError::IoError(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "incomplete command body in packet",
            )))
        })
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
        // Broadcast /full packets contain raw packet data
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
