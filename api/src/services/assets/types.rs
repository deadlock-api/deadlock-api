use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct AssetsHero {
    pub(crate) id: u32,
    pub(crate) name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetsRanks {
    pub(crate) tier: u32,
    pub(crate) name: String,
    pub(crate) images: HashMap<String, String>,
}
