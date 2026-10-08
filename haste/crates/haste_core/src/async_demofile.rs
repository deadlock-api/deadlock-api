use tokio::io::{AsyncRead, AsyncReadExt};

use crate::async_demostream::{AsyncDemoStream, read_cmd_header_async};
use crate::demofile::{
    DEMO_HEADER_ID, DEMO_HEADER_ID_SIZE, DEMO_RECORD_BUFFER_SIZE, DemoHeader, DemoHeaderError,
};
use crate::demostream::{
    CmdHeader, ReadCmdError, ReadCmdHeaderError, decompress_cmd_body, split_cmd_buf,
};

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
        let (body, scratch) = split_cmd_buf(&mut self.buf, cmd_header)?;
        self.rdr.read_exact(body).await?;
        decompress_cmd_body(cmd_header, body, scratch)
    }

    fn start_position(&self) -> u64 {
        size_of::<DemoHeader>() as u64
    }
}
