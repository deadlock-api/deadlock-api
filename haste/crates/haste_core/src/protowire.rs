//! minimal borrowing protobuf decoding for the few hot messages whose `bytes` fields would
//! otherwise be copied by prost on every decode (`CDemoPacket.data`,
//! `CSVCMsg_PacketEntities.entity_data`).
//!
//! semantics match prost's generated decoders: unknown fields are skipped, and for a field that
//! appears more than once the last occurrence wins.

use prost::encoding::{
    DecodeContext, WireType, check_wire_type, decode_key, decode_varint, skip_field,
};

use crate::demostream::DecodeCmdError;

struct FieldReader<'a> {
    buf: &'a [u8],
}

impl<'a> FieldReader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf }
    }

    fn next_key(&mut self) -> Result<Option<(u32, WireType)>, DecodeCmdError> {
        if self.buf.is_empty() {
            return Ok(None);
        }
        Ok(Some(decode_key(&mut self.buf)?))
    }

    fn read_bytes(&mut self, wire_type: WireType) -> Result<&'a [u8], DecodeCmdError> {
        check_wire_type(WireType::LengthDelimited, wire_type)?;
        let len = decode_varint(&mut self.buf)?;
        let len = usize::try_from(len)
            .ok()
            .filter(|len| *len <= self.buf.len())
            .ok_or(DecodeCmdError::Malformed)?;
        let (value, rest) = self.buf.split_at(len);
        self.buf = rest;
        Ok(value)
    }

    fn read_varint(&mut self, wire_type: WireType) -> Result<u64, DecodeCmdError> {
        check_wire_type(WireType::Varint, wire_type)?;
        Ok(decode_varint(&mut self.buf)?)
    }

    fn skip(&mut self, tag: u32, wire_type: WireType) -> Result<(), DecodeCmdError> {
        Ok(skip_field(
            wire_type,
            tag,
            &mut self.buf,
            DecodeContext::default(),
        )?)
    }
}

/// `CDemoPacket.data` (field 3), borrowed. a missing field yields an empty slice.
pub(crate) fn decode_cmd_packet_data(data: &[u8]) -> Result<&[u8], DecodeCmdError> {
    let mut rdr = FieldReader::new(data);
    let mut out: &[u8] = &[];
    while let Some((tag, wire_type)) = rdr.next_key()? {
        if tag == 3 {
            out = rdr.read_bytes(wire_type)?;
        } else {
            rdr.skip(tag, wire_type)?;
        }
    }
    Ok(out)
}

/// the parts of `CSVCMsg_PacketEntities` that the parser needs.
pub(crate) struct PacketEntities<'a> {
    pub(crate) updated_entries: i32,
    pub(crate) entity_data: &'a [u8],
}

pub(crate) fn decode_packet_entities(data: &[u8]) -> Result<PacketEntities<'_>, DecodeCmdError> {
    let mut rdr = FieldReader::new(data);
    let mut out = PacketEntities {
        updated_entries: 0,
        entity_data: &[],
    };
    while let Some((tag, wire_type)) = rdr.next_key()? {
        match tag {
            // NOTE: int32 is truncated from the 64 bit varint, as prost does.
            2 => out.updated_entries = rdr.read_varint(wire_type)? as i32,
            7 => out.entity_data = rdr.read_bytes(wire_type)?,
            _ => rdr.skip(tag, wire_type)?,
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use prost::Message;
    use valveprotos::common::{CDemoPacket, CsvcMsgPacketEntities};

    use super::*;

    #[test]
    fn test_cmd_packet_data_matches_prost() {
        let msg = CDemoPacket {
            data: Some(vec![1, 2, 3, 0xff]),
        };
        let buf = msg.encode_to_vec();
        assert_eq!(decode_cmd_packet_data(&buf).unwrap(), &[1, 2, 3, 0xff]);

        let empty = CDemoPacket { data: None }.encode_to_vec();
        assert_eq!(decode_cmd_packet_data(&empty).unwrap(), &[] as &[u8]);
    }

    #[test]
    fn test_packet_entities_matches_prost() {
        let msg = CsvcMsgPacketEntities {
            max_entries: Some(4096),
            updated_entries: Some(-3),
            legacy_is_delta: Some(true),
            entity_data: Some(vec![9, 8, 7]),
            pending_full_frame: Some(true),
            ..Default::default()
        };
        let buf = msg.encode_to_vec();
        let decoded = decode_packet_entities(&buf).unwrap();
        assert_eq!(decoded.updated_entries, -3);
        assert_eq!(decoded.entity_data, &[9, 8, 7]);
    }

    #[test]
    fn test_truncated_is_an_error() {
        let buf = CDemoPacket {
            data: Some(vec![1, 2, 3]),
        }
        .encode_to_vec();
        assert!(decode_cmd_packet_data(&buf[..buf.len() - 1]).is_err());
        assert!(CDemoPacket::decode(&buf[..buf.len() - 1]).is_err());
    }
}
