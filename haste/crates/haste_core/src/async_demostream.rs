use core::future::Future;
use dungers::varint::{CONTINUE_BIT, PAYLOAD_BITS, VarintError, max_varint_size};
use tokio::io::{AsyncRead, AsyncReadExt};
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};

use crate::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};

async fn read_uvarint_async<R>(rdr: &mut R) -> Result<(u32, usize), VarintError>
where
    R: AsyncRead + Unpin,
{
    let mut buf = [0u8; 1];

    rdr.read_exact(&mut buf).await?;
    let byte = buf[0];
    if (byte & CONTINUE_BIT) == 0 {
        return Ok((u32::from(byte), 1));
    }

    let mut value = u32::from(byte & PAYLOAD_BITS);
    for count in 1..max_varint_size::<u32>() {
        rdr.read_exact(&mut buf).await?;
        let byte = buf[0];
        value |= u32::from(byte & PAYLOAD_BITS) << (count * 7);
        if (byte & CONTINUE_BIT) == 0 {
            return Ok((value, count + 1));
        }
    }

    Err(VarintError::MalformedVarint)
}

pub trait AsyncDemoStream {
    fn read_cmd_header(
        &mut self,
    ) -> impl Future<Output = Result<CmdHeader, ReadCmdHeaderError>> + Send;

    fn read_cmd(
        &mut self,
        cmd_header: &CmdHeader,
    ) -> impl Future<Output = Result<&[u8], ReadCmdError>> + Send;

    fn decode_cmd_send_tables(data: &[u8]) -> Result<CDemoSendTables, DecodeCmdError>;
    fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError>;
    fn decode_cmd_packet(data: &[u8]) -> Result<CDemoPacket, DecodeCmdError>;
    fn decode_cmd_full_packet(data: &[u8]) -> Result<CDemoFullPacket, DecodeCmdError>;

    fn start_position(&self) -> u64;
}

pub(crate) async fn read_cmd_header_async<R>(rdr: &mut R) -> Result<CmdHeader, ReadCmdHeaderError>
where
    R: AsyncRead + Unpin,
{
    const DEM_IS_COMPRESSED: u32 = EDemoCommands::DemIsCompressed as u32;

    let (cmd, cmd_n, body_compressed) = {
        let (cmd_raw, n) = read_uvarint_async(rdr).await?;

        let body_compressed = cmd_raw & DEM_IS_COMPRESSED == DEM_IS_COMPRESSED;

        let cmd = if body_compressed {
            cmd_raw & !DEM_IS_COMPRESSED
        } else {
            cmd_raw
        };

        (
            EDemoCommands::try_from(cmd as i32).map_err(|_| ReadCmdHeaderError::UnknownCmd {
                raw: cmd_raw,
                uncompressed: cmd,
            })?,
            n,
            body_compressed,
        )
    };

    let (tick, tick_n) = {
        let (tick, n) = read_uvarint_async(rdr).await?;
        let tick = tick as i32;
        (tick, n)
    };

    let (body_size, body_size_n) = read_uvarint_async(rdr).await?;

    Ok(CmdHeader {
        cmd,
        body_compressed,
        tick,
        body_size,
        size: (cmd_n + tick_n + body_size_n) as u8,
    })
}
