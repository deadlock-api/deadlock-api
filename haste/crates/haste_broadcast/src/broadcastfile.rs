use std::io::{self, Read, Seek, SeekFrom};

use haste_core::demofile::DEMO_RECORD_BUFFER_SIZE;
use haste_core::demostream::{
    CmdHeader, DecodeCmdError, DemoStream, ReadCmdError, ReadCmdHeaderError, SeekableDemoStream,
};
use valveprotos::common::{CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables};

use crate::demostream::{
    decode_cmd_class_info, decode_cmd_full_packet, decode_cmd_packet, decode_cmd_send_tables,
    read_cmd_header, scan_for_last_tick,
};

/// allows to read recorded broadcasts.
///
/// the format is:
/// - `/0/start`
/// - `/<signup_fragment>/full`
/// - `/<signup_fragment>/delta`
/// - `/<signup_fragment + 1>/delta`
/// - and so on...
pub struct BroadcastFile<R: Read + Seek> {
    rdr: R,
    buf: Vec<u8>,
    total_ticks: Option<i32>,
}

impl<R: Read + Seek> BroadcastFile<R> {
    /// creates a new [`BroadcastFile`] instance from the given reader.
    ///
    /// # performance note
    ///
    /// for optimal performance make sure to provide a reader that implements buffering (for
    /// example [`std::io::BufReader`]).
    pub fn start_reading(rdr: R) -> Self {
        Self {
            rdr,
            buf: vec![0u8; DEMO_RECORD_BUFFER_SIZE],
            total_ticks: None,
        }
    }
}

impl<R: Read + Seek> DemoStream for BroadcastFile<R> {
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
        read_cmd_header(&mut self.rdr)
    }

    // cmd body
    // ----

    fn read_cmd(&mut self, cmd_header: &CmdHeader) -> Result<&[u8], ReadCmdError> {
        assert!(!cmd_header.body_compressed);

        let data = &mut self.buf[..cmd_header.body_size as usize];
        self.rdr.read_exact(data)?;
        Ok(data)
    }

    fn decode_cmd_send_tables(data: &[u8]) -> Result<CDemoSendTables, DecodeCmdError> {
        Ok(decode_cmd_send_tables(data))
    }

    fn decode_cmd_class_info(data: &[u8]) -> Result<CDemoClassInfo, DecodeCmdError> {
        decode_cmd_class_info(data)
    }

    fn decode_cmd_packet(data: &[u8]) -> Result<CDemoPacket, DecodeCmdError> {
        Ok(decode_cmd_packet(data))
    }

    fn decode_cmd_full_packet(data: &[u8]) -> Result<CDemoFullPacket, DecodeCmdError> {
        decode_cmd_full_packet(data)
    }

    fn skip_cmd(&mut self, cmd_header: &CmdHeader) -> Result<(), io::Error> {
        self.rdr
            .seek(SeekFrom::Current(i64::from(cmd_header.body_size)))
            .map(|_| ())
    }
}

impl<R: Read + Seek> SeekableDemoStream for BroadcastFile<R> {
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
        0
    }

    fn total_ticks(&mut self) -> Result<i32, anyhow::Error> {
        if self.total_ticks.is_none() {
            self.total_ticks = Some(scan_for_last_tick(self)?);
        }
        Ok(self.total_ticks.unwrap())
    }
}
