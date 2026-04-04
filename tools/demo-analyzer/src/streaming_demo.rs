use std::io::{self, Read};

use dungers::varint;
use haste::demostream::{CmdHeader, DecodeCmdError, DemoStream, ReadCmdError, ReadCmdHeaderError};
use prost::Message;
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};

use haste::demofile::DEMO_RECORD_BUFFER_SIZE;

const DEMO_HEADER_ID_SIZE: usize = 8;
const DEMO_HEADER_ID: [u8; DEMO_HEADER_ID_SIZE] = *b"PBDEMS2\0";

#[derive(thiserror::Error, Debug)]
pub(crate) enum StreamingDemoError {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error("invalid demo file stamp (got {got:?}; want PBDEMS2\\0)")]
    InvalidHeader { got: [u8; DEMO_HEADER_ID_SIZE] },
}

/// A forward-only [`DemoStream`] that reads from any [`Read`] source
/// without requiring [`Seek`](std::io::Seek).
pub(crate) struct StreamingDemoFile<R: Read> {
    rdr: R,
    buf: Vec<u8>,
    at_eof: bool,
}

impl<R: Read> StreamingDemoFile<R> {
    pub(crate) fn start_reading(mut rdr: R) -> Result<Self, StreamingDemoError> {
        // Read and validate the demo header (16 bytes: stamp + two i32s)
        let mut stamp = [0u8; DEMO_HEADER_ID_SIZE];
        rdr.read_exact(&mut stamp)?;
        if stamp != DEMO_HEADER_ID {
            return Err(StreamingDemoError::InvalidHeader { got: stamp });
        }
        // Skip fileinfo_offset and spawngroups_offset (we don't need them)
        let mut skip = [0u8; size_of::<i32>() * 2];
        rdr.read_exact(&mut skip)?;

        Ok(Self {
            rdr,
            buf: vec![0u8; DEMO_RECORD_BUFFER_SIZE],
            at_eof: false,
        })
    }
}

impl<R: Read> DemoStream for StreamingDemoFile<R> {
    fn is_at_eof(&mut self) -> Result<bool, io::Error> {
        Ok(self.at_eof)
    }

    fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        const DEM_IS_COMPRESSED: u32 = EDemoCommands::DemIsCompressed as u32;

        let (cmd, cmd_n, body_compressed) = {
            let (cmd_raw, n) = match varint::read_uvarint32(&mut self.rdr) {
                Ok(v) => v,
                Err(varint::VarintError::IoError(e))
                    if e.kind() == io::ErrorKind::UnexpectedEof =>
                {
                    self.at_eof = true;
                    return Err(ReadCmdHeaderError::IoError(e));
                }
                Err(e) => return Err(e.into()),
            };

            let body_compressed = cmd_raw & DEM_IS_COMPRESSED == DEM_IS_COMPRESSED;
            let cmd = if body_compressed {
                cmd_raw & !DEM_IS_COMPRESSED
            } else {
                cmd_raw
            };

            (
                EDemoCommands::try_from(cmd.cast_signed()).map_err(|_| {
                    ReadCmdHeaderError::UnknownCmd {
                        raw: cmd_raw,
                        uncompressed: cmd,
                    }
                })?,
                n,
                body_compressed,
            )
        };

        let (tick, tick_n) = {
            let (tick, n) = varint::read_uvarint32(&mut self.rdr)?;
            (tick.cast_signed(), n)
        };

        let (body_size, body_size_n) = varint::read_uvarint32(&mut self.rdr)?;

        Ok(CmdHeader {
            cmd,
            body_compressed,
            tick,
            body_size,
            size: (cmd_n + tick_n + body_size_n) as u8,
        })
    }

    fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        let (left, right) = self.buf.split_at_mut(cmd_header.body_size as usize);
        self.rdr.read_exact(left)?;

        if cmd_header.body_compressed {
            let decompress_len = snap::raw::decompress_len(left)?;
            snap::raw::Decoder::new().decompress(left, right)?;
            Ok(&right[..decompress_len])
        } else {
            Ok(left)
        }
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

    fn skip_cmd(&mut self, cmd_header: &CmdHeader) -> Result<(), io::Error> {
        // Forward-only: read and discard bytes
        let mut remaining = cmd_header.body_size as usize;
        while remaining > 0 {
            let to_read = remaining.min(self.buf.len());
            self.rdr.read_exact(&mut self.buf[..to_read])?;
            remaining -= to_read;
        }
        Ok(())
    }
}
