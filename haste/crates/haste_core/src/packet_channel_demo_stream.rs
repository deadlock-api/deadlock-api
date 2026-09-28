//! Packet-based demo stream for parsing demo file data from a `PacketSource`.
//!
//! This stream receives demo file bytes via a `PacketSource`, enabling integration
//! with any source that yields chunks from a demo file.
//!
//! Unlike broadcast format (fixed 10-byte headers), demo files use varint-encoded
//! command headers and protobuf-encoded command bodies.

use std::io;

use bytes::Bytes;
use prost::Message;
use snap::raw::Decoder as SnapDecoder;
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};

use crate::async_demostream::AsyncDemoStream;
use crate::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};
use crate::packet_source::PacketSource;

const DEM_IS_COMPRESSED: u32 = EDemoCommands::DemIsCompressed as u32;

/// Demo file stream that receives packets from a `PacketSource`.
///
/// Each packet is a chunk of demo file bytes. Commands are read by parsing
/// varint-encoded headers, and command bodies may be snappy-compressed.
pub struct PacketChannelDemoStream<P: PacketSource> {
    source: P,
    /// Current packet being read.
    current: Bytes,
    /// Read position within current packet.
    offset: usize,
    /// Decompression buffer for compressed command bodies.
    decompress_buf: Vec<u8>,
    /// Buffer for command body data.
    body_buf: Vec<u8>,
    /// Whether we've skipped the demo header (16 bytes).
    header_skipped: bool,
}

impl<P: PacketSource> PacketChannelDemoStream<P> {
    /// Create a new stream that receives packets from the given source.
    pub fn new(source: P) -> Self {
        Self {
            source,
            current: Bytes::new(),
            offset: 0,
            decompress_buf: Vec::with_capacity(256 * 1024),
            body_buf: Vec::with_capacity(256 * 1024),
            header_skipped: false,
        }
    }

    /// Ensure we have at least `n` bytes available, fetching more packets if needed.
    async fn ensure_bytes(&mut self, n: usize) -> Result<(), ReadCmdHeaderError> {
        while self.remaining() < n {
            match self.source.recv().await {
                Some(bytes) => {
                    // Append new bytes to current buffer
                    if self.offset > 0 {
                        // Compact: move remaining data to start
                        let remaining = self.current.slice(self.offset..);
                        let mut new_buf = Vec::with_capacity(remaining.len() + bytes.len());
                        new_buf.extend_from_slice(&remaining);
                        new_buf.extend_from_slice(&bytes);
                        self.current = Bytes::from(new_buf);
                        self.offset = 0;
                    } else if self.current.is_empty() {
                        self.current = bytes;
                    } else {
                        let mut new_buf = Vec::with_capacity(self.current.len() + bytes.len());
                        new_buf.extend_from_slice(&self.current);
                        new_buf.extend_from_slice(&bytes);
                        self.current = Bytes::from(new_buf);
                    }
                }
                None => {
                    return Err(ReadCmdHeaderError::IoError(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "packet source exhausted",
                    )));
                }
            }
        }
        Ok(())
    }

    fn remaining(&self) -> usize {
        self.current.len().saturating_sub(self.offset)
    }

    fn read_bytes(&mut self, n: usize) -> &[u8] {
        let slice = &self.current[self.offset..self.offset + n];
        self.offset += n;
        slice
    }

    #[allow(dead_code)]
    fn peek_bytes(&self, n: usize) -> &[u8] {
        &self.current[self.offset..self.offset + n]
    }

    /// Read a varint from the current position.
    fn read_varint(&mut self) -> Result<(u32, usize), ReadCmdHeaderError> {
        const CONTINUE_BIT: u8 = 0x80;
        const PAYLOAD_BITS: u8 = 0x7F;

        let mut value: u32 = 0;
        let mut shift = 0;
        let mut bytes_read = 0;

        loop {
            if self.remaining() == 0 {
                return Err(ReadCmdHeaderError::IoError(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "incomplete varint",
                )));
            }

            let byte = self.read_bytes(1)[0];
            bytes_read += 1;

            value |= (u32::from(byte & PAYLOAD_BITS)) << shift;

            if (byte & CONTINUE_BIT) == 0 {
                return Ok((value, bytes_read));
            }

            shift += 7;
            if shift >= 32 {
                return Err(ReadCmdHeaderError::IoError(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "varint too large",
                )));
            }
        }
    }

    /// Skip the demo file header if we haven't already.
    async fn skip_header_if_needed(&mut self) -> Result<(), ReadCmdHeaderError> {
        // DemoHeader = 8 bytes (stamp) + 4 bytes (fileinfo_offset) + 4 bytes (spawngroups_offset) = 16 bytes
        const DEMO_HEADER_SIZE: usize = 16;

        if !self.header_skipped {
            self.ensure_bytes(DEMO_HEADER_SIZE).await?;
            self.offset += DEMO_HEADER_SIZE;
            self.header_skipped = true;
        }
        Ok(())
    }
}

impl<P: PacketSource> AsyncDemoStream for PacketChannelDemoStream<P> {
    async fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        // Skip demo header on first call
        self.skip_header_if_needed().await?;

        // Ensure we have enough bytes for at least one varint (max 5 bytes each, 3 varints)
        self.ensure_bytes(15).await?;

        let start_offset = self.offset;

        // Read command type (varint)
        let (cmd_raw, _) = self.read_varint()?;
        let body_compressed = (cmd_raw & DEM_IS_COMPRESSED) == DEM_IS_COMPRESSED;
        let cmd_value = if body_compressed {
            cmd_raw & !DEM_IS_COMPRESSED
        } else {
            cmd_raw
        };

        let cmd = EDemoCommands::try_from(cmd_value as i32).map_err(|_| {
            ReadCmdHeaderError::UnknownCmd {
                raw: cmd_raw,
                uncompressed: cmd_value,
            }
        })?;

        // Read tick (varint, signed stored as unsigned)
        let (tick_raw, _) = self.read_varint()?;
        let tick = tick_raw as i32;

        // Read body size (varint)
        let (body_size, _) = self.read_varint()?;

        let header_size = (self.offset - start_offset) as u8;

        Ok(CmdHeader {
            cmd,
            body_compressed,
            tick,
            body_size,
            size: header_size,
        })
    }

    async fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        let size = cmd_header.body_size as usize;

        self.ensure_bytes(size).await.map_err(|e| match e {
            ReadCmdHeaderError::IoError(io_err) => ReadCmdError::IoError(io_err),
            _ => ReadCmdError::IoError(io::Error::other("ensure bytes failed")),
        })?;

        // Copy data to body_buf first to avoid borrow issues
        self.body_buf.clear();
        self.body_buf
            .extend_from_slice(&self.current[self.offset..self.offset + size]);
        self.offset += size;

        if cmd_header.body_compressed {
            // Decompress with snappy
            let uncompressed_size = snap::raw::decompress_len(&self.body_buf).map_err(|e| {
                ReadCmdError::IoError(io::Error::new(io::ErrorKind::InvalidData, e))
            })?;

            self.decompress_buf.resize(uncompressed_size, 0);
            let mut decoder = SnapDecoder::new();
            decoder
                .decompress(&self.body_buf, &mut self.decompress_buf)
                .map_err(|e| {
                    ReadCmdError::IoError(io::Error::new(io::ErrorKind::InvalidData, e))
                })?;

            // Swap buffers so decompress_buf becomes body_buf
            core::mem::swap(&mut self.body_buf, &mut self.decompress_buf);
        }

        Ok(&self.body_buf)
    }

    fn decode_cmd_send_tables(data: &[u8]) -> Result<CDemoSendTables, DecodeCmdError> {
        CDemoSendTables::decode(data).map_err(DecodeCmdError::DecodeProtobufError)
    }

    fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError> {
        CDemoClassInfo::decode(data).map_err(DecodeCmdError::DecodeProtobufError)
    }

    fn decode_cmd_packet(data: &[u8]) -> Result<CDemoPacket, DecodeCmdError> {
        CDemoPacket::decode(data).map_err(DecodeCmdError::DecodeProtobufError)
    }

    fn decode_cmd_full_packet(data: &[u8]) -> Result<CDemoFullPacket, DecodeCmdError> {
        CDemoFullPacket::decode(data).map_err(DecodeCmdError::DecodeProtobufError)
    }

    fn start_position(&self) -> u64 {
        16 // DemoHeader size: 8 (stamp) + 4 (fileinfo_offset) + 4 (spawngroups_offset)
    }
}
