use strum::Display;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Display)]
#[strum(serialize_all = "lowercase")]
pub(crate) enum FragmentType {
    Full = 0,
    Delta = 1,
}

pub(crate) mod hltv_download;
pub(crate) mod hltv_extract_meta;
