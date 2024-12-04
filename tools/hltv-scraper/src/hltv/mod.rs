#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum FragmentType {
    Full = 0,
    Delta = 1,
}

impl FragmentType {
    fn as_str(&self) -> &'static str {
        match self {
            FragmentType::Full => "full",
            FragmentType::Delta => "delta",
        }
    }
}

pub mod hltv_download;
pub mod hltv_extract_meta;
