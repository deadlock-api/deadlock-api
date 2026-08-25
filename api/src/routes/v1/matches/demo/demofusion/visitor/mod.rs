mod collecting_visitor;
mod schema_discovery;

pub(super) use collecting_visitor::{CollectedBatches, CollectingVisitor};
pub(super) use schema_discovery::{discover_all_schemas_from_demo, discover_schemas_from_demo};

use std::io::Cursor;

use bytes::Bytes;
use haste_core::demofile::{DemoFile, DemoHeaderError};
use haste_core::demostream::SeekableDemoStream;
use haste_core::parser::{Parser, Visitor};

/// A `.dem` file as an in-memory, seekable stream. `Cursor<Bytes>` supports `Seek`, which the
/// parallel collector needs to jump between full-packet segment boundaries.
pub(super) type SyncDemoStream = DemoFile<Cursor<Bytes>>;

/// The buffered-broadcast stream format, backing live/spectator queries.
pub(super) type BroadcastDemoStream = haste_broadcast::BroadcastFile<Cursor<Bytes>>;

/// Build a seekable demo stream over a byte buffer, abstracting the two wire formats (`.dem` files
/// and GOTV broadcasts) so schema discovery, segmentation and collection are written once.
pub(super) trait BuildStream: SeekableDemoStream + Sized {
    fn build(bytes: Bytes) -> Result<Self, DemoHeaderError>;
}

impl BuildStream for SyncDemoStream {
    fn build(bytes: Bytes) -> Result<Self, DemoHeaderError> {
        DemoFile::start_reading(Cursor::new(bytes))
    }
}

impl BuildStream for BroadcastDemoStream {
    fn build(bytes: Bytes) -> Result<Self, DemoHeaderError> {
        // Broadcasts carry no demo header, so reading never fails on one.
        Ok(haste_broadcast::BroadcastFile::start_reading(Cursor::new(
            bytes,
        )))
    }
}

/// Build a synchronous, seekable parser reading `bytes` directly from memory.
pub(super) fn sync_parser<D: BuildStream, V: Visitor>(
    bytes: Bytes,
    visitor: V,
) -> Result<Parser<D, V>, DemoHeaderError> {
    Parser::from_stream_with_visitor(D::build(bytes)?, visitor)
}

/// A do-nothing visitor used to drive the header-only full-packet scan.
struct ScanVisitor;
impl Visitor for ScanVisitor {
    type Error = core::convert::Infallible;
}

/// Header-only scan returning the tick of every full packet in the demo.
///
/// Full packets are complete state snapshots and therefore valid points to begin an independent
/// parse; their positions are how the demo is split into parallel segments. Broadcasts contain no
/// full-packet commands, so this returns an empty list for them (one whole-stream segment).
pub(super) fn scan_full_packet_ticks<D: BuildStream>(
    bytes: Bytes,
) -> super::error::Result<Vec<i32>> {
    let mut parser = sync_parser::<D, _>(bytes, ScanVisitor)
        .map_err(|e| super::error::Error::Schema(e.to_string()))?;
    parser
        .scan_full_packet_ticks()
        .map_err(|e| super::error::Error::Schema(e.to_string()))
}
