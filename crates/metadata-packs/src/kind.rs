/// Which file of a match an entry holds. Readers prefer the lower value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Kind {
    /// `processed/metadata/{id}.meta.bz2`: downloaded from Valve with the match salts.
    Salt,
    /// `processed/metadata/{id}.meta_hltv.bz2`: rebuilt from an HLTV broadcast.
    Hltv,
    /// `failed/metadata/{id}.meta.bz2`: could not be ingested (error outcome or unreadable).
    FailedSalt,
    /// `failed/metadata/{id}.meta_hltv.bz2`.
    FailedHltv,
}

impl Kind {
    /// The kinds the API serves, in order of preference.
    pub const SERVED: &'static [Self] = &[Self::Salt, Self::Hltv];
    /// Every kind, in the order the ingest worker's re-ingest looks for them.
    pub const ALL: &'static [Self] = &[Self::Salt, Self::Hltv, Self::FailedSalt, Self::FailedHltv];

    #[must_use]
    pub const fn as_u8(self) -> u8 {
        match self {
            Self::Salt => 0,
            Self::Hltv => 1,
            Self::FailedSalt => 2,
            Self::FailedHltv => 3,
        }
    }

    #[must_use]
    pub const fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::Salt),
            1 => Some(Self::Hltv),
            2 => Some(Self::FailedSalt),
            3 => Some(Self::FailedHltv),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_i16(self) -> i16 {
        i16::from(self.as_u8())
    }

    #[must_use]
    pub fn from_i16(value: i16) -> Option<Self> {
        u8::try_from(value).ok().and_then(Self::from_u8)
    }

    /// The metric label of the kind.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Salt => "salt",
            Self::Hltv => "hltv",
            Self::FailedSalt => "failed_salt",
            Self::FailedHltv => "failed_hltv",
        }
    }
}

/// The compression of a file, sniffed from its magic bytes (Valve kept the `.bz2` names when it
/// switched to zstd).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Codec {
    Bzip2,
    Zstd,
    /// Neither magic: stored as it came.
    Plain,
}

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];
const BZIP2_MAGIC: [u8; 3] = *b"BZh";

impl Codec {
    #[must_use]
    pub fn sniff(data: &[u8]) -> Self {
        if data.starts_with(&ZSTD_MAGIC) {
            Self::Zstd
        } else if data.starts_with(&BZIP2_MAGIC) {
            Self::Bzip2
        } else {
            Self::Plain
        }
    }

    #[must_use]
    pub const fn as_u8(self) -> u8 {
        match self {
            Self::Bzip2 => 0,
            Self::Zstd => 1,
            Self::Plain => 2,
        }
    }

    #[must_use]
    pub const fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::Bzip2),
            1 => Some(Self::Zstd),
            2 => Some(Self::Plain),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_i16(self) -> i16 {
        i16::from(self.as_u8())
    }

    #[must_use]
    pub fn from_i16(value: i16) -> Option<Self> {
        u8::try_from(value).ok().and_then(Self::from_u8)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_and_codecs_round_trip() {
        for kind in Kind::ALL {
            assert_eq!(Kind::from_i16(kind.as_i16()), Some(*kind));
        }
        for codec in [Codec::Bzip2, Codec::Zstd, Codec::Plain] {
            assert_eq!(Codec::from_i16(codec.as_i16()), Some(codec));
        }
        assert_eq!(Kind::from_i16(-1), None);
        assert_eq!(Codec::from_u8(9), None);
    }

    #[test]
    fn sniffs_magic() {
        assert_eq!(Codec::sniff(b"BZh91AY"), Codec::Bzip2);
        assert_eq!(Codec::sniff(&[0x28, 0xb5, 0x2f, 0xfd, 0]), Codec::Zstd);
        assert_eq!(Codec::sniff(b"\x08\x01"), Codec::Plain);
        assert_eq!(Codec::sniff(b""), Codec::Plain);
    }
}
