use std::io::{self, SeekFrom};

use dungers::varint;
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};

#[derive(Debug, Clone)]
pub struct CmdHeader {
    pub cmd: EDemoCommands,
    pub body_compressed: bool,
    pub tick: i32,
    pub body_size: u32,
    // NOTE: it is siginficantly cheaper to sum n bytes that were read (cmd, tick body_size) then
    // to rely on Seek::stream_position.
    //
    /// size of the cmd header (/ how many bytes were read). can be used to unread the cmd header.
    pub size: u8,
}

#[derive(thiserror::Error, Debug)]
pub enum ReadCmdHeaderError {
    #[error(transparent)]
    IoError(#[from] io::Error),
    #[error(transparent)]
    ReadVarintError(#[from] varint::VarintError),
    #[error("unknown cmd (raw {raw}; uncompressed {uncompressed})")]
    UnknownCmd { raw: u32, uncompressed: u32 },
}

#[derive(thiserror::Error, Debug)]
pub enum ReadCmdError {
    #[error(transparent)]
    IoError(#[from] io::Error),
    #[error(transparent)]
    DecompressError(#[from] snap::Error),
}

#[derive(thiserror::Error, Debug)]
pub enum DecodeCmdError {
    #[error(transparent)]
    DecodeProtobufError(#[from] prost::DecodeError),
}

/// forward-only demo stream that does not require seeking.
pub trait DemoStream {
    // stream ops
    // ----

    fn is_at_eof(&mut self) -> Result<bool, io::Error>;

    // cmd header
    // ----

    fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError>;

    // cmd
    // ----

    fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError>;

    fn decode_cmd_send_tables(data: &[u8]) -> Result<CDemoSendTables, DecodeCmdError>;
    fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError>;
    fn decode_cmd_packet(data: &[u8]) -> Result<CDemoPacket, DecodeCmdError>;
    fn decode_cmd_full_packet(data: &[u8]) -> Result<CDemoFullPacket, DecodeCmdError>;

    fn skip_cmd(&mut self, cmd_header: &CmdHeader) -> Result<(), io::Error>;
}

/// extension of [`DemoStream`] that supports seeking. required for operations like
/// [`Parser::run_to_tick`](crate::parser::Parser::run_to_tick).
pub trait SeekableDemoStream: DemoStream {
    fn seek(&mut self, pos: SeekFrom) -> Result<u64, io::Error>;

    fn stream_position(&mut self) -> Result<u64, io::Error>;

    /// reimplementation of nightly [`std::io::Seek::stream_len`].
    fn stream_len(&mut self) -> Result<u64, io::Error> {
        let old_pos = self.stream_position()?;
        let len = self.seek(SeekFrom::End(0))?;

        // avoid seeking a third time when we were already at the end of the
        // stream. the branch is usually way cheaper than a seek operation.
        if old_pos != len {
            self.seek(SeekFrom::Start(old_pos))?;
        }

        Ok(len)
    }

    fn unread_cmd_header(&mut self, cmd_header: &CmdHeader) -> Result<(), io::Error> {
        self.seek(SeekFrom::Current(-i64::from(cmd_header.size)))
            .map(|_| ())
    }

    fn start_position(&self) -> u64;

    // TODO: how not cool is it to rely on anyhow here?
    fn total_ticks(&mut self) -> Result<i32, anyhow::Error>;
}
