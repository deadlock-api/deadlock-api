use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct AssetsHero {
    pub id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetsRanks {
    pub tier: u32,
    pub name: String,
    pub images: HashMap<String, String>,
}
