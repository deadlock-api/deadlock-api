use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::parse_rfc2822_datetime;
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

const RSS_ENDPOINT: &str = "https://forums.playdeadlock.com/forums/changelog.10/index.rss";

#[derive(Debug, Deserialize)]
pub struct Rss {
    pub channel: Channel,
}

#[derive(Debug, Deserialize)]
pub struct Channel {
    #[serde(rename = "item")]
    pub patch_notes: Vec<Patch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct Patch {
    pub title: String,
    #[serde(deserialize_with = "parse_rfc2822_datetime")]
    pub pub_date: DateTime<FixedOffset>,
    pub link: String,
    pub guid: PatchGuid,
    pub author: String,
    pub category: PatchCategory,
    #[serde(rename(deserialize = "dc:creator"))]
    pub dc_creator: String,
    #[serde(rename(deserialize = "content:encoded"))]
    pub content_encoded: String,
    #[serde(rename(deserialize = "slash:comments"))]
    pub slash_comments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct PatchGuid {
    #[serde(rename(deserialize = "@isPermaLink"))]
    pub is_perma_link: bool,
    #[serde(rename(deserialize = "#text"))]
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct PatchCategory {
    #[serde(rename(deserialize = "@domain"))]
    pub domain: String,
    #[serde(rename(deserialize = "#text"))]
    pub text: String,
}

#[cached(
    ty = "TimedCache<u8, Vec<Patch>>",
    create = "{ TimedCache::with_lifespan(30 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
pub async fn fetch_patch_notes(http_client: &reqwest::Client) -> APIResult<Vec<Patch>> {
    let response = http_client
        .get(RSS_ENDPOINT)
        .send()
        .await
        .map_err(|e| APIError::StatusMsg {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            message: format!("Failed to fetch patch notes: {e}"),
        })?;
    let rss = response.text().await.map_err(|e| APIError::StatusMsg {
        status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
        message: format!("Failed to read patch notes: {e}"),
    })?;
    serde_xml_rs::from_str::<Rss>(&rss)
        .map(|rss| rss.channel.patch_notes)
        .map_err(|e| APIError::StatusMsg {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            message: format!("Failed to parse patch notes: {e}"),
        })
}

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = [Patch]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the RSS-Feed failed")
    ),
    tags = ["Patches"],
    summary = "Patch Notes",
    description = r#"
Returns the parsed result of the RSS Feed from the official Forum.

RSS-Feed: https://forums.playdeadlock.com/forums/changelog.10/index.rss
    "#
)]
pub async fn feed(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    fetch_patch_notes(&state.http_client).await.map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_patches() {
        let patches = fetch_patch_notes(&reqwest::Client::new())
            .await
            .expect("Failed to fetch patch notes");
        assert!(patches.len() > 7);
    }
}
