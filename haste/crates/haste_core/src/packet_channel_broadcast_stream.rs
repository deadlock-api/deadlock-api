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

use crate::async_demostream::AsyncDemoStream;
use crate::demostream::{
    BROADCAST_CMD_HEADER_SIZE, CmdFormat, CmdHeader, ReadCmdError, ReadCmdHeaderError,
    parse_broadcast_cmd_header,
};
use crate::packet_source::PacketSource;

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
    pub const fn new(source: P) -> Self {
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
    pub const fn with_initial_packet(source: P, initial: Bytes) -> Self {
        Self {
            source,
            current: initial,
            offset: 0,
        }
    }

    /// Ensure we have data to read, fetching the next non-empty packet if needed.
    ///
    /// Returns `UnexpectedEof` only once the source is closed; that is the clean end of the
    /// stream.
    async fn ensure_data(&mut self) -> Result<(), ReadCmdHeaderError> {
        while self.offset >= self.current.len() {
            let Some(bytes) = self.source.recv().await else {
                return Err(ReadCmdHeaderError::IoError(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "packet source exhausted",
                )));
            };
            self.current = bytes;
            self.offset = 0;
        }
        Ok(())
    }

    /// Read exactly `n` bytes from the current packet; `None` if it has fewer bytes left.
    ///
    /// Returns a slice into the packet (zero-copy via Bytes).
    fn read_bytes(&mut self, n: usize) -> Option<&[u8]> {
        let end = self.offset.checked_add(n)?;
        let slice = self.current.get(self.offset..end)?;
        self.offset = end;
        Some(slice)
    }
}

impl<P: PacketSource> AsyncDemoStream for PacketChannelBroadcastStream<P> {
    const CMD_FORMAT: CmdFormat = CmdFormat::Broadcast;

    async fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        self.ensure_data().await?;

        // NOTE: commands don't span packets, so a packet that stops inside a header is broken.
        // this must not be `UnexpectedEof`: the parser takes that as the end of the stream while
        // the source is still open.
        let Some(&header) = self
            .current
            .get(self.offset..)
            .and_then(<[u8]>::first_chunk)
        else {
            return Err(ReadCmdHeaderError::IoError(io::Error::new(
                io::ErrorKind::InvalidData,
                "incomplete command header in packet",
            )));
        };
        self.offset = self.offset.saturating_add(BROADCAST_CMD_HEADER_SIZE);
        parse_broadcast_cmd_header(header)
    }

    fn read_cmd(
        &mut self,
        cmd_header: &CmdHeader,
    ) -> impl Future<Output = Result<&[u8], ReadCmdError>> + Send {
        let size = cmd_header.body_size as usize;
        core::future::ready(self.read_bytes(size).ok_or_else(|| {
            ReadCmdError::IoError(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "incomplete command body in packet",
            ))
        }))
    }

    fn start_position(&self) -> u64 {
        0 // No demo header in broadcasts
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

    fn stream(packets: &[&[u8]]) -> PacketChannelBroadcastStream<Packets> {
        PacketChannelBroadcastStream::new(Packets(
            packets.iter().map(|p| Bytes::copy_from_slice(p)).collect(),
        ))
    }

    fn header_err_kind(err: &ReadCmdHeaderError) -> Option<io::ErrorKind> {
        match err {
            ReadCmdHeaderError::IoError(e) => Some(e.kind()),
            _ => None,
        }
    }

    /// a cmd with a 1 byte body.
    fn cmd(tick: i32) -> Vec<u8> {
        let mut bytes = vec![EDemoCommands::DemPacket as u8];
        bytes.extend_from_slice(&tick.to_le_bytes());
        bytes.push(0);
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.push(0xaa);
        bytes
    }

    #[test]
    fn closed_source_is_eof() {
        let first = cmd(1);
        let mut s = stream(&[&first, &[]]);
        let header = block_on(s.read_cmd_header()).unwrap();
        assert_eq!(header.tick, 1);
        assert_eq!(block_on(s.read_cmd(&header)).unwrap(), &[0xaa]);
        // the empty packet is skipped, then the closed source ends the stream.
        let err = block_on(s.read_cmd_header()).unwrap_err();
        assert_eq!(header_err_kind(&err), Some(io::ErrorKind::UnexpectedEof));
    }

    #[test]
    fn truncated_header_is_invalid_data() {
        let first = cmd(1);
        let mut s = stream(&[&first[..BROADCAST_CMD_HEADER_SIZE - 1], &cmd(2)]);
        let err = block_on(s.read_cmd_header()).unwrap_err();
        assert_eq!(header_err_kind(&err), Some(io::ErrorKind::InvalidData));
    }
}
