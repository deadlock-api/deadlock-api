use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse_rfc2822_datetime;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use cached::proc_macro::cached;
use cached::TimedCache;
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};

const RSS_ENDPOINT: &str = "https://forums.playdeadlock.com/forums/changelog.10/index.rss";

#[derive(Debug, Deserialize)]
struct Rss {
    channel: Channel,
}

#[derive(Debug, Deserialize)]
struct Channel {
    #[serde(rename = "item")]
    patch_notes: Vec<Patch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(deserialize = "camelCase"))]
struct Patch {
    title: String,
    #[serde(deserialize_with = "parse_rfc2822_datetime")]
    pub_date: DateTime<FixedOffset>,
    link: String,
    guid: PatchGuid,
    author: String,
    category: PatchCategory,
    #[serde(rename(deserialize = "creator"))]
    dc_creator: String,
    #[serde(rename(deserialize = "encoded"))]
    content_encoded: String,
    #[serde(rename(deserialize = "comments"))]
    slash_comments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(deserialize = "camelCase"))]
struct PatchGuid {
    is_perma_link: bool,
    #[serde(rename(deserialize = "$value"))]
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(deserialize = "camelCase"))]
struct PatchCategory {
    domain: String,
    #[serde(rename(deserialize = "$value"))]
    text: String,
}

#[cached(
    ty = "TimedCache<String, Vec<Patch>>",
    create = "{ TimedCache::with_lifespan(30) }",
    result = true,
    convert = r#"{ format!("") }"#
)]
async fn fetch_patch_notes(http_client: reqwest::Client) -> APIResult<Vec<Patch>> {
    let response = http_client
        .get(RSS_ENDPOINT)
        .send()
        .await
        .map_err(|e| APIError::StatusMsg {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            message: format!("Failed to fetch patch notes: {}", e),
        })?;
    let rss = response.text().await.map_err(|e| APIError::StatusMsg {
        status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
        message: format!("Failed to read patch notes: {}", e),
    })?;
    serde_xml_rs::from_str::<Rss>(&rss)
        .map(|rss| rss.channel.patch_notes)
        .map_err(|e| APIError::StatusMsg {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            message: format!("Failed to parse patch notes: {}", e),
        })
}

#[utoipa::path(
    get,
    path = "/",
    responses((status = OK, body = [String])),
    tags = ["Patches"],
    summary = "Patch Notes",
    description = "Lists all patch notes from the official forums."
)]
pub async fn feed(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    fetch_patch_notes(state.http_client).await.map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_patches() {
        let patches = fetch_patch_notes(reqwest::Client::new())
            .await
            .expect("Failed to fetch patch notes");
        println!("{:#?}", patches);
    }
}
