use anyhow::Context;
use dungers::varint;
use prost::Message;
use std::io::{self, Read, Seek, SeekFrom};
use valveprotos::common::CDemoFileInfo;

use crate::demostream::{
    CmdHeader, DemoStream, ReadCmdError, ReadCmdHeaderError, SeekableDemoStream, decode_demo_cmd,
    decompress_cmd_body, split_cmd_buf,
};

// #define DEMO_RECORD_BUFFER_SIZE 2*1024*1024
//
// NOTE: read_cmd reads bytes (cmd_header.body_size) from the rdr into buf, if cmd is compressed
// (cmd_header.body_compressed) it'll decompress the data. buf must be large enough to fit
// compressed and uncompressed data simultaneously.
pub const DEMO_RECORD_BUFFER_SIZE: usize = 2 * 1024 * 1024;

// #define DEMO_HEADER_ID "HL2DEMO"
//
// NOTE: strings in c/cpp are null terminated.
pub(crate) const DEMO_HEADER_ID_SIZE: usize = 8;
pub(crate) const DEMO_HEADER_ID: [u8; DEMO_HEADER_ID_SIZE] = *b"PBDEMS2\0";

// NOTE: naming is based on stuff from demofile.h of valve's demoinfo2 thing.
#[derive(Debug, Clone)]
pub struct DemoHeader {
    pub demofilestamp: [u8; DEMO_HEADER_ID_SIZE],
    pub fileinfo_offset: i32,
    pub spawngroups_offset: i32,
}

#[derive(thiserror::Error, Debug)]
pub enum DemoHeaderError {
    #[error(transparent)]
    IoError(#[from] io::Error),
    #[error("invalid demo file stamp (got {got:?}; want id {DEMO_HEADER_ID:?})")]
    InvalidDemoFileStamp { got: [u8; DEMO_HEADER_ID_SIZE] },
}

fn read_demo_header<R: Read>(mut rdr: R) -> Result<DemoHeader, DemoHeaderError> {
    let mut demofilestamp = [0u8; DEMO_HEADER_ID_SIZE];
    rdr.read_exact(&mut demofilestamp)?;
    if demofilestamp != DEMO_HEADER_ID {
        return Err(DemoHeaderError::InvalidDemoFileStamp { got: demofilestamp });
    }

    let mut buf = [0u8; size_of::<i32>()];

    rdr.read_exact(&mut buf)?;
    let fileinfo_offset = i32::from_le_bytes(buf);

    rdr.read_exact(&mut buf)?;
    let spawngroups_offset = i32::from_le_bytes(buf);

    Ok(DemoHeader {
        demofilestamp,
        fileinfo_offset,
        spawngroups_offset,
    })
}

#[derive(Debug)]
pub struct DemoFile<R: Read + Seek> {
    rdr: R,
    buf: Vec<u8>,
    demo_header: DemoHeader,
    file_info: Option<CDemoFileInfo>,
}

impl<R: Read + Seek> DemoFile<R> {
    /// creates a new [`DemoFile`] instance from the given reader.
    ///
    /// # performance note
    ///
    /// for optimal performance make sure to provide a reader that implements buffering (for
    /// example [`std::io::BufReader`]).
    pub fn start_reading(mut rdr: R) -> Result<Self, DemoHeaderError> {
        let demo_header = read_demo_header(&mut rdr)?;
        Ok(Self {
            rdr,
            buf: vec![0u8; DEMO_RECORD_BUFFER_SIZE],
            demo_header,
            file_info: None,
        })
    }

    pub fn demo_header(&self) -> &DemoHeader {
        &self.demo_header
    }

    pub fn file_info(&mut self) -> Result<&CDemoFileInfo, anyhow::Error> {
        if self.file_info.is_none() {
            let backup = self.rdr.stream_position()?;

            self.rdr
                .seek(SeekFrom::Start(self.demo_header.fileinfo_offset as u64))?;
            let cmd_header = self.read_cmd_header()?;
            self.file_info = Some(CDemoFileInfo::decode(self.read_cmd(&cmd_header)?)?);

            self.rdr.seek(SeekFrom::Start(backup))?;
        }

        self.file_info.as_ref().context("file info not set")
    }
}

impl<R: Read + Seek> DemoStream for DemoFile<R> {
    // stream ops
    // ----

    fn is_at_eof(&mut self) -> Result<bool, io::Error> {
        let pos = self.rdr.stream_position()?;
        let len = self.rdr.seek(SeekFrom::End(0))?;
        if pos != len {
            self.rdr.seek(SeekFrom::Start(pos))?;
        }
        Ok(pos == len)
    }

    // cmd header
    // ----

    fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        let (cmd_raw, cmd_n) = varint::read_uvarint32(&mut self.rdr)?;
        let (cmd, body_compressed) = decode_demo_cmd(cmd_raw)?;
        let (tick, tick_n) = varint::read_uvarint32(&mut self.rdr)?;
        let (body_size, body_size_n) = varint::read_uvarint32(&mut self.rdr)?;

        Ok(CmdHeader {
            cmd,
            body_compressed,
            // NOTE: tick is set to u32::MAX before before all pre-game initialization messages are
            // sent.
            // ticks everywhere are represented as i32, casting u32::MAX to i32 is okay because
            // bits in u32::MAX == bits in -1 i32.
            tick: tick as i32,
            body_size,
            size: (cmd_n + tick_n + body_size_n) as u8,
        })
    }

    // cmd body
    // ----

    fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        let (body, scratch) = split_cmd_buf(&mut self.buf, cmd_header)?;
        self.rdr.read_exact(body)?;
        decompress_cmd_body(cmd_header, body, scratch)
    }

    fn skip_cmd(&mut self, cmd_header: &CmdHeader) -> Result<(), io::Error> {
        self.rdr
            .seek(SeekFrom::Current(i64::from(cmd_header.body_size)))
            .map(|_| ())
    }
}

impl<R: Read + Seek> SeekableDemoStream for DemoFile<R> {
    /// delegated from [`std::io::Seek`].
    fn seek(&mut self, pos: SeekFrom) -> Result<u64, io::Error> {
        self.rdr.seek(pos)
    }

    /// delegated from [`std::io::Seek`].
    ///
    /// # note
    ///
    /// be aware that this method can be quite expensive. it might be best to make sure not to call
    /// it too frequently.
    fn stream_position(&mut self) -> Result<u64, io::Error> {
        self.rdr.stream_position()
    }

    fn start_position(&self) -> u64 {
        size_of::<DemoHeader>() as u64
    }

    fn total_ticks(&mut self) -> Result<i32, anyhow::Error> {
        self.file_info()
            .map(valveprotos::common::CDemoFileInfo::playback_ticks)
    }
}
