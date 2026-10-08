use tokio::io::{AsyncRead, AsyncReadExt};

use crate::async_demostream::{AsyncDemoStream, read_cmd_header_async};
use crate::demofile::{DEMO_RECORD_BUFFER_SIZE, DemoHeader, DemoHeaderError};
use crate::demostream::{CmdHeader, ReadCmdError, ReadCmdHeaderError};

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
        let body_size = cmd_header.body_size as usize;
        if body_size > self.buf.len() {
            return Err(ReadCmdError::IoError(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "cmd body of {body_size} bytes exceeds the {} byte buffer",
                    self.buf.len()
                ),
            )));
        }
        let (left, right) = self.buf.split_at_mut(body_size);
        self.rdr.read_exact(left).await?;

        if cmd_header.body_compressed {
            let decompress_len = snap::raw::decompress_len(left)?;
            snap::raw::Decoder::new().decompress(left, right)?;
            Ok(&right[..decompress_len])
        } else {
            Ok(left)
        }
    }

    fn start_position(&self) -> u64 {
        size_of::<DemoHeader>() as u64
    }
}
