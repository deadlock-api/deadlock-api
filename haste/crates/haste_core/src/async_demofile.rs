use prost::Message;
use tokio::io::{AsyncRead, AsyncReadExt};
use valveprotos::common::{CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables};

use crate::async_demostream::{AsyncDemoStream, read_cmd_header_async};
use crate::demofile::{DEMO_RECORD_BUFFER_SIZE, DemoHeader, DemoHeaderError};
use crate::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};

const DEMO_HEADER_ID_SIZE: usize = 8;
const DEMO_HEADER_ID: [u8; DEMO_HEADER_ID_SIZE] = *b"PBDEMS2\0";

async fn read_demo_header_async<R: AsyncRead + Unpin>(
    mut rdr: R,
) -> Result<DemoHeader, DemoHeaderError> {
    let mut demofilestamp = [0u8; DEMO_HEADER_ID_SIZE];
    rdr.read_exact(&mut demofilestamp).await?;
    if demofilestamp != DEMO_HEADER_ID {
        return Err(DemoHeaderError::InvalidDemoFileStamp { got: demofilestamp });
    }

    let mut buf = [0u8; size_of::<i32>()];

    rdr.read_exact(&mut buf).await?;
    let fileinfo_offset = i32::from_le_bytes(buf);

    rdr.read_exact(&mut buf).await?;
    let spawngroups_offset = i32::from_le_bytes(buf);

    Ok(DemoHeader {
        demofilestamp,
        fileinfo_offset,
        spawngroups_offset,
    })
}

pub struct AsyncDemoFile<R: AsyncRead + Unpin> {
    rdr: R,
    buf: Vec<u8>,
    demo_header: DemoHeader,
}

impl<R: AsyncRead + Unpin> AsyncDemoFile<R> {
    pub async fn start_reading(mut rdr: R) -> Result<Self, DemoHeaderError> {
        let demo_header = read_demo_header_async(&mut rdr).await?;
        Ok(Self {
            rdr,
            buf: vec![0u8; DEMO_RECORD_BUFFER_SIZE],
            demo_header,
        })
    }

    pub fn demo_header(&self) -> &DemoHeader {
        &self.demo_header
    }
}

impl<R: AsyncRead + Unpin + Send> AsyncDemoStream for AsyncDemoFile<R> {
    async fn read_cmd_header(&mut self) -> Result<CmdHeader, ReadCmdHeaderError> {
        read_cmd_header_async(&mut self.rdr).await
    }

    async fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        let (left, right) = self.buf.split_at_mut(cmd_header.body_size as usize);
        self.rdr.read_exact(left).await?;

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

    fn start_position(&self) -> u64 {
        size_of::<DemoHeader>() as u64
    }
}
