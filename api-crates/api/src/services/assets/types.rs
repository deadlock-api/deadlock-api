use std::collections::HashMap;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct AssetsHero {
    pub(crate) id: u32,
    pub(crate) name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct AssetsRanks {
    pub(crate) tier: u32,
    pub(crate) name: String,
    pub(crate) images: HashMap<String, String>,
}
