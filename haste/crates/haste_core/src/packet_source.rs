//! Packet source trait for streaming demo parsing.
//!
//! This trait abstracts over different sources of broadcast packets,
//! enabling the same parser to work with:
//! - `mpsc::Receiver<Bytes>` (Rust-native channel)
//! - Any other async byte source

use core::future::Future;

use bytes::Bytes;
use tokio::sync::mpsc;

/// Source of broadcast packets for streaming demo parsing.
///
/// Implementors provide an async `recv()` method that returns the next
/// packet or `None` when exhausted/closed.
pub trait PacketSource: Send {
    /// Receive the next packet, or None if exhausted/closed.
    fn recv(&mut self) -> impl Future<Output = Option<Bytes>> + Send;
}

impl PacketSource for mpsc::Receiver<Bytes> {
    async fn recv(&mut self) -> Option<Bytes> {
        mpsc::Receiver::recv(self).await
    }
}
