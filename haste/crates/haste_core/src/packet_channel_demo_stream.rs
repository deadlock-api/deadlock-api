//! Packet-based demo stream for parsing demo file data from a `PacketSource`.
//!
//! This stream receives demo file bytes via a `PacketSource`, enabling integration
//! with any source that yields chunks from a demo file.
//!
//! Unlike broadcast format (fixed 10-byte headers), demo files use varint-encoded
//! command headers and protobuf-encoded command bodies.

use std::io;

use bytes::Bytes;
use snap::raw::Decoder as SnapDecoder;

use crate::async_demostream::AsyncDemoStream;
use crate::demofile::{DEMO_RECORD_BUFFER_SIZE, DemoHeader};
use crate::demostream::{CmdHeader, ReadCmdError, ReadCmdHeaderError, decode_demo_cmd};
use crate::packet_source::PacketSource;

/// stamp (8 bytes) + `fileinfo_offset` (4 bytes) + `spawngroups_offset` (4 bytes).
const DEMO_HEADER_SIZE: usize = size_of::<DemoHeader>();

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

    /// Ensure the next varint is complete (or that the max varint size is available), fetching
    /// more packets if needed.
    ///
    /// NOTE: varints are variable-length, so requiring the max header size up front would treat
    /// a short final command as the end of the stream.
    async fn ensure_varint(&mut self) -> Result<(), ReadCmdHeaderError> {
        const MAX_VARINT32_SIZE: usize = 5;
        loop {
            let available = &self.current[self.offset..];
            if available.len() >= MAX_VARINT32_SIZE || available.iter().any(|b| b & 0x80 == 0) {
                return Ok(());
            }
            self.ensure_bytes(available.len() + 1).await?;
        }
    }

    fn remaining(&self) -> usize {
        self.current.len().saturating_sub(self.offset)
    }

    fn read_bytes(&mut self, n: usize) -> &[u8] {
        let slice = &self.current[self.offset..self.offset + n];
        self.offset += n;
        slice
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

        // NOTE: fetching more bytes compacts the buffer and moves the offset, so the header size
        // is summed from the varint sizes instead.
        // Read command type (varint)
        self.ensure_varint().await?;
        let (cmd_raw, cmd_size) = self.read_varint()?;
        let (cmd, body_compressed) = decode_demo_cmd(cmd_raw)?;

        // Read tick (varint, signed stored as unsigned)
        self.ensure_varint().await?;
        let (tick_raw, tick_size) = self.read_varint()?;
        let tick = tick_raw as i32;

        // Read body size (varint)
        self.ensure_varint().await?;
        let (body_size, body_size_size) = self.read_varint()?;

        let header_size = (cmd_size + tick_size + body_size_size) as u8;

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

        // the body is borrowed straight from the current packet; only a compressed body needs a
        // buffer of its own.
        let body = &self.current[self.offset..self.offset + size];
        self.offset += size;
        if !cmd_header.body_compressed {
            return Ok(body);
        }

        // Decompress with snappy
        let uncompressed_size = snap::raw::decompress_len(body)
            .map_err(|e| ReadCmdError::IoError(io::Error::new(io::ErrorKind::InvalidData, e)))?;
        // NOTE: the length comes from the (untrusted) snappy header; don't allocate whatever it
        // claims. the file readers decompress into a buffer of this size too.
        if uncompressed_size > DEMO_RECORD_BUFFER_SIZE {
            return Err(ReadCmdError::IoError(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "cmd body decompresses to {uncompressed_size} bytes, more than the \
                     {DEMO_RECORD_BUFFER_SIZE} byte limit"
                ),
            )));
        }

        self.decompress_buf.resize(uncompressed_size, 0);
        SnapDecoder::new()
            .decompress(body, &mut self.decompress_buf)
            .map_err(|e| ReadCmdError::IoError(io::Error::new(io::ErrorKind::InvalidData, e)))?;

        Ok(&self.decompress_buf)
    }

    fn start_position(&self) -> u64 {
        DEMO_HEADER_SIZE as u64
    }
}

#[cfg(test)]
mod tests {
    use core::pin::pin;
    use core::task::{Context, Poll, Waker};
    use std::collections::VecDeque;

    use valveprotos::common::EDemoCommands;

    use super::*;

    /// packets that are all available up front; `recv` never pends.
    struct Packets(VecDeque<Bytes>);

    impl PacketSource for Packets {
        fn recv(&mut self) -> impl Future<Output = Option<Bytes>> + Send {
            core::future::ready(self.0.pop_front())
        }
    }

    fn block_on<F: Future>(fut: F) -> F::Output {
        let mut fut = pin!(fut);
        match fut.as_mut().poll(&mut Context::from_waker(Waker::noop())) {
            Poll::Ready(v) => v,
            Poll::Pending => panic!("packet source never pends"),
        }
    }

    fn stream(packets: &[&[u8]]) -> PacketChannelDemoStream<Packets> {
        let mut first = vec![0u8; DEMO_HEADER_SIZE];
        first.extend_from_slice(packets.first().copied().unwrap_or_default());
        let rest = packets.iter().skip(1).map(|p| Bytes::copy_from_slice(p));
        PacketChannelDemoStream::new(Packets(
            core::iter::once(Bytes::from(first)).chain(rest).collect(),
        ))
    }

    fn is_eof(err: &ReadCmdHeaderError) -> bool {
        matches!(err, ReadCmdHeaderError::IoError(e) if e.kind() == io::ErrorKind::UnexpectedEof)
    }

    const PACKET: u8 = EDemoCommands::DemPacket as u8;

    #[test]
    fn short_final_cmd_is_read() {
        // a 4 byte final cmd (3 byte header + 1 byte body), split across two packets.
        let mut s = stream(&[&[PACKET, 5], &[1, 0xaa]]);
        let header = block_on(s.read_cmd_header()).unwrap();
        assert_eq!(header.cmd, EDemoCommands::DemPacket);
        assert_eq!(header.tick, 5);
        assert_eq!(header.body_size, 1);
        assert_eq!(header.size, 3);
        assert_eq!(block_on(s.read_cmd(&header)).unwrap(), &[0xaa]);
        assert!(is_eof(&block_on(s.read_cmd_header()).unwrap_err()));
    }

    #[test]
    fn multi_byte_varints_span_packets() {
        // tick 300 = [0xac, 0x02], split between the two bytes.
        let mut s = stream(&[&[PACKET, 0xac], &[0x02, 0], &[]]);
        let header = block_on(s.read_cmd_header()).unwrap();
        assert_eq!(header.tick, 300);
        assert_eq!(header.body_size, 0);
        assert_eq!(header.size, 4);
        assert!(is_eof(&block_on(s.read_cmd_header()).unwrap_err()));
    }

    #[test]
    fn truncated_header_is_eof() {
        let mut s = stream(&[&[PACKET, 0x80]]);
        assert!(is_eof(&block_on(s.read_cmd_header()).unwrap_err()));
    }

    #[test]
    fn oversized_decompress_len_is_rejected() {
        // a snappy body whose header claims 1 GiB of output.
        let mut body = Vec::new();
        let mut len = 1u32 << 30;
        while len >= 0x80 {
            body.push((len as u8) | 0x80);
            len >>= 7;
        }
        body.push(len as u8);
        let cmd = PACKET | EDemoCommands::DemIsCompressed as u8;
        let mut bytes = vec![cmd, 0, body.len() as u8];
        bytes.extend_from_slice(&body);
        let mut s = stream(&[&bytes]);
        let header = block_on(s.read_cmd_header()).unwrap();
        assert!(header.body_compressed);
        assert!(block_on(s.read_cmd(&header)).is_err());
        assert!(s.decompress_buf.len() <= DEMO_RECORD_BUFFER_SIZE);
    }
}
