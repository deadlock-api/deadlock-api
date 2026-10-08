use std::io::{self, SeekFrom};

use dungers::varint;
use prost::Message;
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
    #[error("malformed command body")]
    Malformed,
}

/// encoding of command bodies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CmdFormat {
    /// `.dem` files: every body is a protobuf message (`CDemoPacket`, `CDemoSendTables`, ...).
    Demo,
    /// broadcasts (`/full` and `/delta` fragments): packet bodies are the raw packet data, send
    /// tables are prefixed with 4 bytes, and full packets carry only raw packet data.
    Broadcast,
}

/// decodes a `DemSendTables` command body.
pub fn decode_cmd_send_tables(
    format: CmdFormat,
    data: &[u8],
) -> Result<CDemoSendTables, DecodeCmdError> {
    match format {
        CmdFormat::Demo => CDemoSendTables::decode(data).map_err(DecodeCmdError::from),
        CmdFormat::Broadcast => Ok(CDemoSendTables {
            // TODO: no-copy for send tables cmd.
            data: Some(data.get(4..).ok_or(DecodeCmdError::Malformed)?.to_vec()),
        }),
    }
}

/// decodes a `DemClassInfo` command body (same in both formats).
pub fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError> {
    CDemoClassInfo::decode(data).map_err(DecodeCmdError::from)
}

/// the packet data of a `DemPacket` / `DemSignonPacket` command body, borrowed from `data`.
pub fn cmd_packet_data(format: CmdFormat, data: &[u8]) -> Result<&[u8], DecodeCmdError> {
    match format {
        CmdFormat::Demo => crate::protowire::decode_cmd_packet_data(data),
        CmdFormat::Broadcast => Ok(data),
    }
}

/// decodes a `DemFullPacket` command body.
pub fn decode_cmd_full_packet(
    format: CmdFormat,
    data: &[u8],
) -> Result<CDemoFullPacket, DecodeCmdError> {
    match format {
        CmdFormat::Demo => CDemoFullPacket::decode(data).map_err(DecodeCmdError::from),
        CmdFormat::Broadcast => Ok(CDemoFullPacket {
            string_table: None,
            packet: Some(CDemoPacket {
                data: Some(data.to_vec()),
            }),
        }),
    }
}

/// forward-only demo stream that does not require seeking.
pub trait DemoStream {
    /// encoding of command bodies; drives the default `decode_cmd_*` implementations.
    const CMD_FORMAT: CmdFormat = CmdFormat::Demo;

    // stream ops
    // ----

    fn is_at_eof(&mut self) -> Result<bool, io::Error>;

    // cmd header
    // ----

    fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError>;

    // cmd
    // ----

    fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError>;

    fn decode_cmd_send_tables(data: &[u8]) -> Result<CDemoSendTables, DecodeCmdError> {
        decode_cmd_send_tables(Self::CMD_FORMAT, data)
    }

    fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError> {
        decode_cmd_class_info(data)
    }

    /// the packet data of a `DemPacket` / `DemSignonPacket` command body, without copying it.
    fn cmd_packet_data(data: &[u8]) -> Result<&[u8], DecodeCmdError> {
        cmd_packet_data(Self::CMD_FORMAT, data)
    }

    fn decode_cmd_full_packet(data: &[u8]) -> Result<CDemoFullPacket, DecodeCmdError> {
        decode_cmd_full_packet(Self::CMD_FORMAT, data)
    }

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
