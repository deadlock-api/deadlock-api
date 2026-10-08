use std::io::{Read, SeekFrom};

use haste_core::demostream::{
    BROADCAST_CMD_HEADER_SIZE, CmdHeader, ReadCmdHeaderError, SeekableDemoStream,
    parse_broadcast_cmd_header,
};

pub(crate) fn read_cmd_header<R: Read>(mut rdr: R) -> Result<CmdHeader, ReadCmdHeaderError> {
    let mut buf = [0u8; BROADCAST_CMD_HEADER_SIZE];
    rdr.read_exact(&mut buf)?;
    parse_broadcast_cmd_header(buf)
}

// other
// ----

pub(crate) fn scan_for_last_tick(
    demo_stream: &mut impl SeekableDemoStream,
) -> Result<i32, anyhow::Error> {
    let mut last_tick: i32 = -1;
    let backup = demo_stream.stream_position()?;
    loop {
        match demo_stream.read_cmd_header() {
            Ok(cmd_header) => {
                last_tick = cmd_header.tick;
                demo_stream.skip_cmd(&cmd_header)?;
            }
            Err(_) if demo_stream.is_at_eof().unwrap_or_default() => {
                demo_stream.seek(SeekFrom::Start(backup))?;
                return Ok(last_tick);
            }
            Err(err) => return Err(err.into()),
        }
    }
}
