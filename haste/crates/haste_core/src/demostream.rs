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

/// splits a raw demo file cmd (the first varint of a cmd header) into the command and whether
/// its body is snappy-compressed.
pub(crate) fn decode_demo_cmd(cmd_raw: u32) -> Result<(EDemoCommands, bool), ReadCmdHeaderError> {
    const DEM_IS_COMPRESSED: u32 = EDemoCommands::DemIsCompressed as u32;

    let body_compressed = cmd_raw & DEM_IS_COMPRESSED == DEM_IS_COMPRESSED;
    let cmd = if body_compressed {
        cmd_raw & !DEM_IS_COMPRESSED
    } else {
        cmd_raw
    };
    let cmd = EDemoCommands::try_from(cmd as i32).map_err(|_| ReadCmdHeaderError::UnknownCmd {
        raw: cmd_raw,
        uncompressed: cmd,
    })?;
    Ok((cmd, body_compressed))
}

/// size of a broadcast cmd header: 1 byte cmd, 4 bytes tick, 1 unknown byte and 4 bytes body size.
pub const BROADCAST_CMD_HEADER_SIZE: usize = 10;

/// parses a broadcast cmd header. broadcast cmd headers carry the same values as demo file cmd
/// headers, but in fixed size little-endian fields instead of varints, and bodies are never
/// compressed.
///
/// thanks to saul for figuring it out. see
/// <https://github.com/saul/demofile-net/blob/7d3d59e478dbd2b000f4efa2dac70ed1bf2e2b7f/src/DemoFile/HttpBroadcastReader.cs#L150>
pub fn parse_broadcast_cmd_header(
    buf: [u8; BROADCAST_CMD_HEADER_SIZE],
) -> Result<CmdHeader, ReadCmdHeaderError> {
    let [cmd, t0, t1, t2, t3, _unknown, s0, s1, s2, s3] = buf;
    let cmd =
        EDemoCommands::try_from(i32::from(cmd)).map_err(|_| ReadCmdHeaderError::UnknownCmd {
            raw: u32::from(cmd),
            uncompressed: u32::from(cmd),
        })?;
    Ok(CmdHeader {
        cmd,
        body_compressed: false,
        tick: i32::from_le_bytes([t0, t1, t2, t3]),
        body_size: u32::from_le_bytes([s0, s1, s2, s3]),
        size: BROADCAST_CMD_HEADER_SIZE as u8,
    })
}

/// splits a cmd buffer (see [`crate::demofile::DEMO_RECORD_BUFFER_SIZE`]) into the part that the
/// body of `cmd_header` is read into and the rest, which a compressed body is decompressed into.
pub fn split_cmd_buf<'b>(
    buf: &'b mut [u8],
    cmd_header: &CmdHeader,
) -> Result<(&'b mut [u8], &'b mut [u8]), ReadCmdError> {
    let body_size = cmd_header.body_size as usize;
    if body_size > buf.len() {
        return Err(ReadCmdError::IoError(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "cmd body of {body_size} bytes exceeds the {} byte buffer",
                buf.len()
            ),
        )));
    }
    Ok(buf.split_at_mut(body_size))
}

/// the cmd body that was read into `body`, decompressed into `scratch` if it is compressed.
pub(crate) fn decompress_cmd_body<'b>(
    cmd_header: &CmdHeader,
    body: &'b [u8],
    scratch: &'b mut [u8],
) -> Result<&'b [u8], ReadCmdError> {
    if cmd_header.body_compressed {
        let len = snap::raw::Decoder::new().decompress(body, scratch)?;
        // NOTE: we need to slice stuff up, because prost's decode can't determine when to stop.
        Ok(&scratch[..len])
    } else {
        Ok(body)
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_broadcast_cmd_header() {
        // DemPacket (7), tick 0x01020304, an unknown byte, body size 0x0a0b.
        let header = parse_broadcast_cmd_header([7, 4, 3, 2, 1, 0xff, 0x0b, 0x0a, 0, 0]).unwrap();
        assert_eq!(header.cmd, EDemoCommands::DemPacket);
        assert!(!header.body_compressed);
        assert_eq!(header.tick, 0x0102_0304);
        assert_eq!(header.body_size, 0x0a0b);
        assert_eq!(header.size as usize, BROADCAST_CMD_HEADER_SIZE);

        assert!(matches!(
            parse_broadcast_cmd_header([0xff; BROADCAST_CMD_HEADER_SIZE]),
            Err(ReadCmdHeaderError::UnknownCmd { raw: 0xff, .. })
        ));
    }

    #[test]
    fn test_decode_demo_cmd() {
        let compressed = EDemoCommands::DemPacket as u32 | EDemoCommands::DemIsCompressed as u32;
        assert!(matches!(
            decode_demo_cmd(compressed),
            Ok((EDemoCommands::DemPacket, true))
        ));
        assert!(matches!(
            decode_demo_cmd(EDemoCommands::DemPacket as u32),
            Ok((EDemoCommands::DemPacket, false))
        ));
    }
}
