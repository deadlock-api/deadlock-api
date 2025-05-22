use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct Hero {
    pub id: u32,
    pub in_development: Option<bool>,
}

pub async fn fetch_hero_ids(http_client: &reqwest::Client) -> reqwest::Result<Vec<u32>> {
    let heroes: Vec<Hero> = http_client
        .get("https://assets.deadlock-api.com/v2/heroes?only_active=true")
        .send()
        .await?
        .json()
        .await?;
    Ok(heroes
        .iter()
        .filter(|h| h.in_development.is_none_or(|d| !d))
        .map(|h| h.id)
        .collect())
}
