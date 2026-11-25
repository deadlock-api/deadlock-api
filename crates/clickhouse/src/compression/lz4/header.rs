// Source: https://github.com/PSeitz/lz4_flex/blob/0.14.0/src/frame/header.rs
// `lz4_flex` is already a dependency, so SBOM generation should include its license file.
// Code not related to _reading_ frame headers has been deleted.
// Calls to `Read::read_exact()` on `&[u8]` have been replaced with `read_fixed()`.
use twox_hash::XxHash32;

use core::fmt::{Debug, Display, Formatter};

const FLG_RESERVED_MASK: u8 = 0b00000010;
const FLG_VERSION_MASK: u8 = 0b11000000;
const FLG_SUPPORTED_VERSION_BITS: u8 = 0b01000000;

const FLG_INDEPENDENT_BLOCKS: u8 = 0b00100000;
const FLG_BLOCK_CHECKSUMS: u8 = 0b00010000;
const FLG_CONTENT_SIZE: u8 = 0b00001000;
const FLG_CONTENT_CHECKSUM: u8 = 0b00000100;
const FLG_DICTIONARY_ID: u8 = 0b00000001;

const BD_RESERVED_MASK: u8 = !BD_BLOCK_SIZE_MASK;
const BD_BLOCK_SIZE_MASK: u8 = 0b01110000;
const BD_BLOCK_SIZE_MASK_RSHIFT: u8 = 4;

const BLOCK_UNCOMPRESSED_SIZE_BIT: u32 = 0x80000000;

const LZ4F_MAGIC_NUMBER: u32 = 0x184D2204;
pub(crate) const LZ4F_LEGACY_MAGIC_NUMBER: u32 = 0x184C2102;
const LZ4F_SKIPPABLE_MAGIC_RANGE: core::ops::RangeInclusive<u32> = 0x184D2A50..=0x184D2A5F;

#[derive(Clone, Copy, PartialEq, Debug)]
/// Different predefines blocksizes to choose when compressing data.
pub(crate) enum BlockSize {
    /// The default block size.
    Max64KB = 4,
    /// 256KB block size.
    Max256KB = 5,
    /// 1MB block size.
    Max1MB = 6,
    /// 4MB block size.
    Max4MB = 7,
    /// 8MB block size.
    Max8MB = 8,
}

impl BlockSize {
    pub(crate) const fn get(self) -> usize {
        match self {
            Self::Max64KB => 64 * 1024,
            Self::Max256KB => 256 * 1024,
            Self::Max1MB => 1024 * 1024,
            Self::Max4MB => 4 * 1024 * 1024,
            Self::Max8MB => 8 * 1024 * 1024,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
/// The two `BlockMode` operations that can be set on (`FrameInfo`)[`FrameInfo`]
#[derive(Default)]
pub(crate) enum BlockMode {
    /// Every block is compressed independently. The default.
    #[default]
    Independent,
    /// Blocks can reference data from previous blocks.
    ///
    /// Effective when the stream contains small blocks.
    Linked,
}

// From: https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md
//
// General Structure of LZ4 Frame format
// -------------------------------------
//
// | MagicNb | F. Descriptor | Block | (...) | EndMark | C. Checksum |
// |:-------:|:-------------:| ----- | ----- | ------- | ----------- |
// | 4 bytes |  3-15 bytes   |       |       | 4 bytes | 0-4 bytes   |
//
// Frame Descriptor
// ----------------
//
// | FLG     | BD      | (Content Size) | (Dictionary ID) | HC      |
// | ------- | ------- |:--------------:|:---------------:| ------- |
// | 1 byte  | 1 byte  |  0 - 8 bytes   |   0 - 4 bytes   | 1 byte  |
//
// __FLG byte__
//
// |  BitNb  |  7-6  |   5   |    4     |  3   |    2     |    1     |   0  |
// | ------- |-------|-------|----------|------|----------|----------|------|
// |FieldName|Version|B.Indep|B.Checksum|C.Size|C.Checksum|*Reserved*|DictID|
//
// __BD byte__
//
// |  BitNb  |     7    |     6-5-4     |  3-2-1-0 |
// | ------- | -------- | ------------- | -------- |
// |FieldName|*Reserved*| Block MaxSize |*Reserved*|
//
// Data Blocks
// -----------
//
// | Block Size |  data  | (Block Checksum) |
// |:----------:| ------ |:----------------:|
// |  4 bytes   |        |   0 - 4 bytes    |
//
#[derive(Debug, Clone)]
/// The metadata for de/compressing with lz4 frame format.
pub(crate) struct FrameInfo {
    /// If set, includes the total uncompressed size of data in the frame.
    pub(crate) content_size: Option<u64>,
    /// The identifier for the dictionary that must be used to correctly decode data.
    /// The compressor and the decompressor must use exactly the same dictionary.
    ///
    /// Note that this is currently unsupported and for this reason it's not pub.
    pub(crate) dict_id: Option<u32>,
    /// The maximum uncompressed size of each data block.
    pub(crate) block_size: BlockSize,
    /// The block mode.
    pub(crate) block_mode: BlockMode,
    /// If set, includes a checksum for each data block in the frame.
    pub(crate) block_checksums: bool,
    /// If set, includes a content checksum to verify that the full frame contents have been
    /// decoded correctly.
    pub(crate) content_checksum: bool,
    /// If set, use the legacy frame format
    pub(crate) legacy_frame: bool,
}

impl FrameInfo {
    pub(crate) fn read(input: &mut &[u8]) -> Result<Self, HeaderError> {
        let original_input = &**input;
        // 4 byte Magic
        let magic_num = { u32::from_le_bytes(read_fixed(input)?) };
        if magic_num == LZ4F_LEGACY_MAGIC_NUMBER {
            return Ok(Self {
                content_size: None,
                dict_id: None,
                block_size: BlockSize::Max8MB,
                block_mode: BlockMode::default(),
                block_checksums: false,
                content_checksum: false,
                legacy_frame: true,
            });
        }
        if LZ4F_SKIPPABLE_MAGIC_RANGE.contains(&magic_num) {
            let user_data_len = u32::from_le_bytes(read_fixed(input)?);
            return Err(HeaderError::SkippableFrame(user_data_len));
        }
        if magic_num != LZ4F_MAGIC_NUMBER {
            return Err(HeaderError::WrongMagicNumber);
        }

        // fixed size section
        let [flg_byte, bd_byte] = read_fixed(input)?;

        if flg_byte & FLG_VERSION_MASK != FLG_SUPPORTED_VERSION_BITS {
            // version is always 01
            return Err(HeaderError::UnsupportedVersion(flg_byte & FLG_VERSION_MASK));
        }

        if flg_byte & FLG_RESERVED_MASK != 0 || bd_byte & BD_RESERVED_MASK != 0 {
            return Err(HeaderError::ReservedBitsSet);
        }

        let block_mode = if flg_byte & FLG_INDEPENDENT_BLOCKS != 0 {
            BlockMode::Independent
        } else {
            BlockMode::Linked
        };
        let content_checksum = flg_byte & FLG_CONTENT_CHECKSUM != 0;
        let block_checksums = flg_byte & FLG_BLOCK_CHECKSUMS != 0;

        let block_size = match (bd_byte & BD_BLOCK_SIZE_MASK) >> BD_BLOCK_SIZE_MASK_RSHIFT {
            4 => BlockSize::Max64KB,
            5 => BlockSize::Max256KB,
            6 => BlockSize::Max1MB,
            7 => BlockSize::Max4MB,
            // The mask leaves 0..=7, so these are 0..=3.
            i => return Err(HeaderError::UnsupportedBlocksize(i)),
        };

        // var len section
        let content_size = if flg_byte & FLG_CONTENT_SIZE != 0 {
            Some(u64::from_le_bytes(read_fixed(input)?))
        } else {
            None
        };

        let dict_id = if flg_byte & FLG_DICTIONARY_ID != 0 {
            Some(u32::from_le_bytes(read_fixed(input)?))
        } else {
            None
        };

        // 1 byte header checksum
        let [expected_checksum] = read_fixed(input)?;

        // The descriptor without the magic number and the checksum byte.
        let consumed = original_input.len().saturating_sub(input.len());
        let descriptor = original_input
            .get(4..consumed.saturating_sub(1))
            .ok_or(HeaderError::HeaderChecksum)?;
        // The second byte of the hash: `(hash >> 8) as u8`.
        let [_, header_hash, ..] = XxHash32::oneshot(0, descriptor).to_le_bytes();
        if header_hash != expected_checksum {
            return Err(HeaderError::HeaderChecksum);
        }

        Ok(Self {
            content_size,
            dict_id,
            block_size,
            block_mode,
            block_checksums,
            content_checksum,
            legacy_frame: false,
        })
    }
}

#[derive(Debug)]
pub(crate) enum BlockInfo {
    Compressed(u32),
    Uncompressed(u32),
    EndMark,
}

impl BlockInfo {
    pub(crate) fn read(input: &mut &[u8]) -> Result<Self, HeaderError> {
        let size = u32::from_le_bytes(read_fixed(input)?);
        if size == 0 {
            Ok(Self::EndMark)
        } else if size & BLOCK_UNCOMPRESSED_SIZE_BIT != 0 {
            Ok(Self::Uncompressed(size & !BLOCK_UNCOMPRESSED_SIZE_BIT))
        } else {
            Ok(Self::Compressed(size))
        }
    }
}

fn read_fixed<const LEN: usize>(input: &mut &[u8]) -> Result<[u8; LEN], HeaderError> {
    let (chunk, rem) = input
        .split_first_chunk()
        .ok_or_else(|| HeaderError::InsufficientData(LEN.saturating_sub(input.len())))?;

    *input = rem;
    Ok(*chunk)
}

#[derive(Debug)]
pub(crate) enum HeaderError {
    /// Not enough data to read the frame header.
    ///
    /// Included is the amount of additional bytes to be read.
    InsufficientData(usize),
    /// Unsupported block size.
    UnsupportedBlocksize(#[expect(dead_code, reason = "only read by the Debug impl")] u8),
    /// Unsupported frame version.
    UnsupportedVersion(#[expect(dead_code, reason = "only read by the Debug impl")] u8),
    /// Wrong magic number for the LZ4 frame format.
    WrongMagicNumber,
    /// Reserved bits set.
    ReservedBitsSet,
    /// The Frame header checksum doesn't match.
    HeaderChecksum,
    /// Read an skippable frame.
    /// The caller may read the specified amount of bytes from the underlying `io::Read`.
    SkippableFrame(#[expect(dead_code, reason = "only read by the Debug impl")] u32),
}

impl Display for HeaderError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        write!(f, "{self:?}")
    }
}

impl core::error::Error for HeaderError {}
