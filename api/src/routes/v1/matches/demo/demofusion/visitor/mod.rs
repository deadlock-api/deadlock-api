mod collecting_visitor;
mod schema_discovery;

pub(super) use collecting_visitor::{CollectedBatches, CollectingVisitor};
pub(super) use schema_discovery::{discover_all_schemas_from_demo, discover_schemas_from_demo};

use std::io::Cursor;

use bytes::Bytes;
use haste_core::demofile::{DemoFile, DemoHeaderError};
use haste_core::parser::{Parser, Visitor};

/// A seekable, synchronous demo stream over the full demo bytes held in memory.
///
/// `Cursor<Bytes>` reads the resident buffer directly and supports `Seek`, which the parallel
/// collector needs to jump between full-packet segment boundaries.
type SyncDemoStream = DemoFile<Cursor<Bytes>>;

/// Build a synchronous, seekable parser reading `bytes` directly from memory.
pub(super) fn sync_parser<V: Visitor>(
    bytes: Bytes,
    visitor: V,
) -> Result<Parser<SyncDemoStream, V>, DemoHeaderError> {
    let demo = DemoFile::start_reading(Cursor::new(bytes))?;
    Parser::from_stream_with_visitor(demo, visitor)
}

/// A do-nothing visitor used to drive the header-only full-packet scan.
struct ScanVisitor;
impl Visitor for ScanVisitor {
    type Error = core::convert::Infallible;
}

/// Header-only scan returning the tick of every full packet in the demo.
///
/// Full packets are complete state snapshots and therefore valid points to begin an independent
/// parse; their positions are how the demo is split into parallel segments.
pub(super) fn scan_full_packet_ticks(bytes: Bytes) -> super::error::Result<Vec<i32>> {
    let mut parser =
        sync_parser(bytes, ScanVisitor).map_err(|e| super::error::Error::Schema(e.to_string()))?;
    parser
        .scan_full_packet_ticks()
        .map_err(|e| super::error::Error::Schema(e.to_string()))
}
