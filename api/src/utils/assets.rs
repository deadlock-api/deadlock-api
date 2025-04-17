use cached::TimedCache;
use cached::proc_macro::cached;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct AssetsHero {
    pub id: u32,
    pub name: String,
}

#[cached(
    ty = "TimedCache<u8, Vec<AssetsHero>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }"
)]
pub async fn fetch_heroes(http_client: &reqwest::Client) -> reqwest::Result<Vec<AssetsHero>> {
    http_client
        .get("https://assets.deadlock-api.com/v2/heroes")
        .send()
        .await?
        .json()
        .await
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetsRanks {
    pub tier: u32,
    pub name: String,
    pub images: HashMap<String, String>,
}

#[cached(
    ty = "TimedCache<u8, Vec<AssetsRanks>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
pub async fn fetch_ranks(http_client: &reqwest::Client) -> reqwest::Result<Vec<AssetsRanks>> {
    http_client
        .get("https://assets.deadlock-api.com/v2/ranks")
        .send()
        .await?
        .json()
        .await
}

pub async fn fetch_hero_id_from_name(
    http_client: &reqwest::Client,
    hero_name: &str,
) -> reqwest::Result<Option<u32>> {
    fetch_heroes(http_client).await.map(|h| {
        h.iter()
            .find(|h| h.name.to_lowercase() == hero_name.to_lowercase())
            .map(|h| h.id)
    })
}

pub async fn fetch_hero_name_from_id(
    http_client: &reqwest::Client,
    hero_id: u32,
) -> reqwest::Result<Option<String>> {
    fetch_heroes(http_client)
        .await
        .map(|h| h.into_iter().find(|h| h.id == hero_id).map(|h| h.name))
}
