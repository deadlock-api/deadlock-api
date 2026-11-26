//! Finds the `FileDescriptorProto`s that protoc's C++ codegen embeds in a binary and decodes them.
//!
//! A port of the scanner and collector of `SteamRE`'s `ProtobufDumper`
//! (<https://github.com/SteamRE/SteamKit/tree/master/Resources/ProtobufDumper>), the tool that
//! `SteamDatabase/Protobufs` is dumped with, so both find the same descriptors.

use std::collections::HashSet;

/// One field value as it is on the wire.
#[derive(Debug, Clone)]
pub(crate) enum Wire {
    Varint(u64),
    Fixed64(u64),
    Len(Vec<u8>),
    Fixed32(u32),
}

/// The fields of a message in wire order: (field number, value).
pub(crate) type Raw = Vec<(u32, Wire)>;

pub(crate) fn read_varint(buf: &[u8], pos: &mut usize) -> Option<u64> {
    let mut result = 0_u64;
    let mut shift = 0_u32;
    loop {
        let byte = *buf.get(*pos)?;
        *pos = pos.checked_add(1)?;
        result |= u64::from(byte & 0x7f).checked_shl(shift)?;
        if byte < 0x80 {
            return Some(result);
        }
        shift = shift.checked_add(7)?;
    }
}

fn take<'a>(buf: &'a [u8], pos: &mut usize, len: usize) -> Option<&'a [u8]> {
    let end = pos.checked_add(len)?;
    let bytes = buf.get(*pos..end)?;
    *pos = end;
    Some(bytes)
}

/// Reads one field header and value; `None` on a malformed or truncated field.
fn read_field(buf: &[u8], pos: &mut usize) -> Option<(u32, Wire)> {
    let tag = read_varint(buf, pos)?;
    let number = u32::try_from(tag.checked_shr(3)?)
        .ok()
        .filter(|&n| n != 0)?;
    let value = match tag & 7 {
        0 => Wire::Varint(read_varint(buf, pos)?),
        1 => Wire::Fixed64(u64::from_le_bytes(take(buf, pos, 8)?.try_into().ok()?)),
        2 => {
            let len = usize::try_from(read_varint(buf, pos)?).ok()?;
            Wire::Len(take(buf, pos, len)?.to_vec())
        }
        5 => Wire::Fixed32(u32::from_le_bytes(take(buf, pos, 4)?.try_into().ok()?)),
        _ => return None,
    };
    Some((number, value))
}

/// Parses a whole buffer as one message; `None` if any field is malformed.
pub(crate) fn read_fields(buf: &[u8]) -> Option<Raw> {
    let mut fields = Vec::new();
    let mut pos = 0;
    while pos < buf.len() {
        fields.push(read_field(buf, &mut pos)?);
    }
    Some(fields)
}

/// Length of the message that starts at `buf`: fields are read until one is malformed, a zero
/// tag, or a second field 1 (the `name` of the next descriptor), as `ConsumeOneMessage` in
/// `ProtobufDumper` does.
fn message_len(buf: &[u8]) -> usize {
    let mut pos = 0;
    let mut seen_name = false;
    loop {
        let start = pos;
        if buf.get(pos) == Some(&0) {
            return start;
        }
        match read_field(buf, &mut pos) {
            Some((1, _)) if seen_name => return start,
            Some((1, _)) => seen_name = true,
            Some(_) => {}
            None => return start,
        }
    }
}

/// The options messages of descriptor.proto.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum OptionsKind {
    File,
    Message,
    Field,
    Oneof,
    Enum,
    EnumValue,
    Service,
    Method,
    ExtensionRange,
}

impl OptionsKind {
    pub(crate) const fn type_name(self) -> &'static str {
        match self {
            Self::File => ".google.protobuf.FileOptions",
            Self::Message => ".google.protobuf.MessageOptions",
            Self::Field => ".google.protobuf.FieldOptions",
            Self::Oneof => ".google.protobuf.OneofOptions",
            Self::Enum => ".google.protobuf.EnumOptions",
            Self::EnumValue => ".google.protobuf.EnumValueOptions",
            Self::Service => ".google.protobuf.ServiceOptions",
            Self::Method => ".google.protobuf.MethodOptions",
            Self::ExtensionRange => ".google.protobuf.ExtensionRangeOptions",
        }
    }

    /// The fields `ProtobufDumper`'s own `Descriptor.cs` declares. They are printed by name;
    /// every other field is resolved against the binary's descriptor.proto and extensions.
    const fn known_fields(self) -> &'static [u32] {
        match self {
            Self::File => &[
                1, 8, 9, 10, 11, 16, 17, 18, 20, 23, 27, 31, 36, 37, 39, 40, 41, 42, 44, 45, 999,
            ],
            Self::Message => &[1, 2, 3, 7, 999],
            Self::Field => &[1, 2, 3, 5, 6, 10, 999],
            Self::Enum => &[2, 3, 999],
            Self::EnumValue => &[1, 999],
            Self::Service => &[33, 999],
            Self::Method => &[33, 34, 999],
            Self::Oneof | Self::ExtensionRange => &[999],
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Options {
    pub(crate) kind: OptionsKind,
    pub(crate) raw: Raw,
}

impl Options {
    /// The last value of a field (a repeated non-repeated field keeps its last value).
    pub(crate) fn last(&self, number: u32) -> Option<&Wire> {
        self.raw
            .iter()
            .rev()
            .find(|(n, _)| *n == number)
            .map(|(_, v)| v)
    }

    pub(crate) fn flag(&self, number: u32) -> Option<bool> {
        match self.last(number)? {
            Wire::Varint(v) => Some(*v != 0),
            _ => None,
        }
    }

    /// The fields `Descriptor.cs` doesn't know, left over as unknown fields there.
    pub(crate) fn unknown(&self) -> Raw {
        let known = self.kind.known_fields();
        self.raw
            .iter()
            .filter(|(n, _)| !known.contains(n))
            .cloned()
            .collect()
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct FileDesc {
    pub(crate) name: String,
    pub(crate) package: Option<String>,
    pub(crate) dependency: Vec<String>,
    pub(crate) public_dependency: Vec<i32>,
    pub(crate) weak_dependency: Vec<i32>,
    pub(crate) message_type: Vec<MessageDesc>,
    pub(crate) enum_type: Vec<EnumDesc>,
    pub(crate) service: Vec<ServiceDesc>,
    pub(crate) extension: Vec<FieldDesc>,
    pub(crate) options: Option<Options>,
    pub(crate) syntax: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct MessageDesc {
    pub(crate) name: String,
    pub(crate) field: Vec<FieldDesc>,
    pub(crate) extension: Vec<FieldDesc>,
    pub(crate) nested_type: Vec<Self>,
    pub(crate) enum_type: Vec<EnumDesc>,
    pub(crate) extension_range: Vec<ExtensionRange>,
    pub(crate) oneof_decl: Vec<OneofDesc>,
    pub(crate) options: Option<Options>,
    pub(crate) reserved_range: Vec<(i32, i32)>,
    pub(crate) reserved_name: Vec<String>,
}

impl MessageDesc {
    pub(crate) fn is_map_entry(&self) -> bool {
        self.options.as_ref().and_then(|o| o.flag(7)) == Some(true)
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ExtensionRange {
    pub(crate) start: i32,
    pub(crate) end: i32,
    pub(crate) options: Option<Options>,
}

#[derive(Debug, Clone)]
pub(crate) struct FieldDesc {
    pub(crate) name: String,
    pub(crate) number: i32,
    pub(crate) label: i32,
    pub(crate) kind: i32,
    pub(crate) type_name: Option<String>,
    pub(crate) extendee: Option<String>,
    pub(crate) default_value: Option<String>,
    pub(crate) oneof_index: Option<i32>,
    pub(crate) json_name: Option<String>,
    pub(crate) options: Option<Options>,
    pub(crate) proto3_optional: bool,
}

impl Default for FieldDesc {
    fn default() -> Self {
        Self {
            name: String::new(),
            number: 0,
            label: LABEL_OPTIONAL,
            kind: 0,
            type_name: None,
            extendee: None,
            default_value: None,
            oneof_index: None,
            json_name: None,
            options: None,
            proto3_optional: false,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct OneofDesc {
    pub(crate) name: String,
    pub(crate) options: Option<Options>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EnumDesc {
    pub(crate) name: String,
    pub(crate) value: Vec<EnumValueDesc>,
    pub(crate) options: Option<Options>,
    pub(crate) reserved_range: Vec<(i32, i32)>,
    pub(crate) reserved_name: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EnumValueDesc {
    pub(crate) name: String,
    pub(crate) number: i32,
    pub(crate) options: Option<Options>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ServiceDesc {
    pub(crate) name: String,
    pub(crate) method: Vec<MethodDesc>,
    pub(crate) options: Option<Options>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct MethodDesc {
    pub(crate) name: String,
    pub(crate) input_type: Option<String>,
    pub(crate) output_type: Option<String>,
    pub(crate) options: Option<Options>,
    pub(crate) client_streaming: bool,
    pub(crate) server_streaming: bool,
}

pub(crate) const LABEL_OPTIONAL: i32 = 1;

fn string(value: Wire) -> Option<String> {
    match value {
        Wire::Len(bytes) => String::from_utf8(bytes).ok(),
        _ => None,
    }
}

/// An int32 field: the low 32 bits of the varint, as protobuf reads it.
pub(crate) fn int32(value: u64) -> i32 {
    // the mask keeps the value in u32 range, so the conversion cannot fail
    u32::try_from(value & 0xffff_ffff)
        .unwrap_or_default()
        .cast_signed()
}

fn int(value: &Wire) -> Option<i32> {
    match value {
        Wire::Varint(v) => Some(int32(*v)),
        _ => None,
    }
}

const fn boolean(value: &Wire) -> Option<bool> {
    match value {
        Wire::Varint(v) => Some(*v != 0),
        _ => None,
    }
}

/// A repeated int32 field, packed or not.
fn ints(value: Wire, out: &mut Vec<i32>) -> Option<()> {
    match value {
        Wire::Varint(v) => out.push(int32(v)),
        Wire::Len(bytes) => {
            let mut pos = 0;
            while pos < bytes.len() {
                out.push(int32(read_varint(&bytes, &mut pos)?));
            }
        }
        _ => return None,
    }
    Some(())
}

fn message<T>(value: Wire, decode: fn(Raw) -> Option<T>) -> Option<T> {
    match value {
        Wire::Len(bytes) => decode(read_fields(&bytes)?),
        _ => None,
    }
}

/// Options that occur more than once are merged, as protobuf merges messages.
fn options(target: &mut Option<Options>, kind: OptionsKind, value: Wire) -> Option<()> {
    let Wire::Len(bytes) = value else {
        return None;
    };
    let raw = read_fields(&bytes)?;
    match target {
        Some(existing) => existing.raw.extend(raw),
        None => *target = Some(Options { kind, raw }),
    }
    Some(())
}

fn range(raw: Raw) -> Option<(i32, i32)> {
    let (mut start, mut end) = (0, 0);
    for (number, value) in raw {
        match number {
            1 => start = int(&value)?,
            2 => end = int(&value)?,
            _ => {}
        }
    }
    Some((start, end))
}

pub(crate) fn decode_file(raw: Raw) -> Option<FileDesc> {
    let mut file = FileDesc::default();
    for (number, value) in raw {
        match number {
            1 => file.name = string(value)?,
            2 => file.package = Some(string(value)?),
            3 => file.dependency.push(string(value)?),
            4 => file.message_type.push(message(value, decode_message)?),
            5 => file.enum_type.push(message(value, decode_enum)?),
            6 => file.service.push(message(value, decode_service)?),
            7 => file.extension.push(message(value, decode_field)?),
            8 => options(&mut file.options, OptionsKind::File, value)?,
            10 => ints(value, &mut file.public_dependency)?,
            11 => ints(value, &mut file.weak_dependency)?,
            12 => file.syntax = Some(string(value)?),
            _ => {}
        }
    }
    Some(file)
}

fn decode_message(raw: Raw) -> Option<MessageDesc> {
    let mut msg = MessageDesc::default();
    for (number, value) in raw {
        match number {
            1 => msg.name = string(value)?,
            2 => msg.field.push(message(value, decode_field)?),
            3 => msg.nested_type.push(message(value, decode_message)?),
            4 => msg.enum_type.push(message(value, decode_enum)?),
            5 => msg
                .extension_range
                .push(message(value, decode_extension_range)?),
            6 => msg.extension.push(message(value, decode_field)?),
            7 => options(&mut msg.options, OptionsKind::Message, value)?,
            8 => msg.oneof_decl.push(message(value, decode_oneof)?),
            9 => msg.reserved_range.push(message(value, range)?),
            10 => msg.reserved_name.push(string(value)?),
            _ => {}
        }
    }
    Some(msg)
}

fn decode_extension_range(raw: Raw) -> Option<ExtensionRange> {
    let mut range = ExtensionRange::default();
    for (number, value) in raw {
        match number {
            1 => range.start = int(&value)?,
            2 => range.end = int(&value)?,
            3 => options(&mut range.options, OptionsKind::ExtensionRange, value)?,
            _ => {}
        }
    }
    Some(range)
}

fn decode_field(raw: Raw) -> Option<FieldDesc> {
    let mut field = FieldDesc::default();
    for (number, value) in raw {
        match number {
            1 => field.name = string(value)?,
            2 => field.extendee = Some(string(value)?),
            3 => field.number = int(&value)?,
            4 => field.label = int(&value)?,
            5 => field.kind = int(&value)?,
            6 => field.type_name = Some(string(value)?),
            7 => field.default_value = Some(string(value)?),
            8 => options(&mut field.options, OptionsKind::Field, value)?,
            9 => field.oneof_index = Some(int(&value)?),
            10 => field.json_name = Some(string(value)?),
            17 => field.proto3_optional = boolean(&value)?,
            _ => {}
        }
    }
    Some(field)
}

fn decode_oneof(raw: Raw) -> Option<OneofDesc> {
    let mut oneof = OneofDesc::default();
    for (number, value) in raw {
        match number {
            1 => oneof.name = string(value)?,
            2 => options(&mut oneof.options, OptionsKind::Oneof, value)?,
            _ => {}
        }
    }
    Some(oneof)
}

fn decode_enum(raw: Raw) -> Option<EnumDesc> {
    let mut desc = EnumDesc::default();
    for (number, value) in raw {
        match number {
            1 => desc.name = string(value)?,
            2 => desc.value.push(message(value, decode_enum_value)?),
            3 => options(&mut desc.options, OptionsKind::Enum, value)?,
            4 => desc.reserved_range.push(message(value, range)?),
            5 => desc.reserved_name.push(string(value)?),
            _ => {}
        }
    }
    Some(desc)
}

fn decode_enum_value(raw: Raw) -> Option<EnumValueDesc> {
    let mut desc = EnumValueDesc::default();
    for (number, value) in raw {
        match number {
            1 => desc.name = string(value)?,
            2 => desc.number = int(&value)?,
            3 => options(&mut desc.options, OptionsKind::EnumValue, value)?,
            _ => {}
        }
    }
    Some(desc)
}

fn decode_service(raw: Raw) -> Option<ServiceDesc> {
    let mut desc = ServiceDesc::default();
    for (number, value) in raw {
        match number {
            1 => desc.name = string(value)?,
            2 => desc.method.push(message(value, decode_method)?),
            3 => options(&mut desc.options, OptionsKind::Service, value)?,
            _ => {}
        }
    }
    Some(desc)
}

fn decode_method(raw: Raw) -> Option<MethodDesc> {
    let mut desc = MethodDesc::default();
    for (number, value) in raw {
        match number {
            1 => desc.name = string(value)?,
            2 => desc.input_type = Some(string(value)?),
            3 => desc.output_type = Some(string(value)?),
            4 => options(&mut desc.options, OptionsKind::Method, value)?,
            5 => desc.client_streaming = boolean(&value)?,
            6 => desc.server_streaming = boolean(&value)?,
            _ => {}
        }
    }
    Some(desc)
}

/// `^[a-zA-Z_0-9\\/.-]+\.proto$`
fn is_proto_name(name: &[u8]) -> bool {
    name.strip_suffix(b".proto").is_some_and(|stem| {
        !stem.is_empty()
            && stem.iter().all(|&c| {
                c.is_ascii_alphanumeric() || matches!(c, b'_' | b'\\' | b'/' | b'.' | b'-')
            })
    })
}

/// Reads the name of a descriptor that starts at `pos` (a `0x0A` byte).
fn candidate_name(data: &[u8], pos: usize) -> Option<&[u8]> {
    let first = *data.get(pos.checked_add(1)?)?;
    let (len, header) = if first & 0x80 == 0 {
        (usize::from(first), 2)
    } else {
        // names of 128 characters or more take two bytes
        let second = *data.get(pos.checked_add(2)?)?;
        if second & 0x80 != 0 {
            return None;
        }
        (
            usize::from(first & 0x7f) | usize::from(second).checked_shl(7)?,
            3,
        )
    };
    let start = pos.checked_add(header)?;
    let name = data.get(start..start.checked_add(len)?)?;
    let suffix = name.get(name.len().checked_sub(6)?..)?;
    suffix.eq_ignore_ascii_case(b".proto").then_some(name)
}

/// Scans a binary and appends the descriptors whose names aren't in `files` yet, in the order
/// they appear: the first copy of a file wins, across all scanned binaries.
pub(crate) fn scan(data: &[u8], files: &mut Vec<FileDesc>) {
    let mut seen: HashSet<String> = files.iter().map(|f| f.name.clone()).collect();
    let mut pos = 0_usize;
    while let Some(offset) = data
        .get(pos..)
        .and_then(|rest| rest.iter().position(|&b| b == 0x0a))
    {
        pos = pos.saturating_add(offset);
        let advance = try_candidate(data, pos, &mut seen, files);
        pos = pos.saturating_add(advance);
    }
}

/// Tries the descriptor that may start at `pos`; returns how far to move on. A candidate that
/// fails to decode is skipped as far as it was read, as `ProtobufDumper` does.
fn try_candidate(
    data: &[u8],
    pos: usize,
    seen: &mut HashSet<String>,
    files: &mut Vec<FileDesc>,
) -> usize {
    let Some(name) = candidate_name(data, pos).filter(|name| is_proto_name(name)) else {
        return 1;
    };
    let name = String::from_utf8_lossy(name).into_owned();
    if seen.contains(&name) {
        return 1;
    }
    let rest = data.get(pos..).unwrap_or_default();
    let len = message_len(rest);
    let file = rest
        .get(..len)
        .filter(|_| len > 0)
        .and_then(read_fields)
        .and_then(decode_file);
    if let Some(file) = file {
        seen.insert(name);
        files.push(file);
    }
    len.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varint_round_trip() {
        let mut pos = 0;
        assert_eq!(read_varint(&[0xac, 0x02], &mut pos), Some(300));
        assert_eq!(pos, 2);
        assert_eq!(read_varint(&[0xff], &mut 0), None);
    }

    #[test]
    fn message_ends_at_the_next_name() {
        // name "a.proto", package "p", then the next descriptor's name
        let mut buf = vec![0x0a, 7];
        buf.extend(b"a.proto");
        buf.extend([0x12, 1, b'p']);
        let len = buf.len();
        buf.extend([0x0a, 7]);
        buf.extend(b"b.proto");
        assert_eq!(message_len(&buf), len);
    }

    #[test]
    fn scan_finds_embedded_descriptors() {
        let mut data = b"junk\x0a\x03abc".to_vec();
        data.extend([0x0a, 7]);
        data.extend(b"a.proto");
        data.extend([0x12, 1, b'p', 0]);
        let mut files = Vec::new();
        scan(&data, &mut files);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "a.proto");
        assert_eq!(files[0].package.as_deref(), Some("p"));
    }

    #[test]
    fn proto_names() {
        assert!(is_proto_name(b"google/protobuf/descriptor.proto"));
        assert!(!is_proto_name(b".proto"));
        assert!(!is_proto_name(b"a b.proto"));
        assert!(!is_proto_name(b"a.PROTO"));
    }
}
