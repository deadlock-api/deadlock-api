//! The client version the Deadlock Game Coordinator accepts.

use core::time::Duration;

use cached::macros::cached;
use reqwest::Response;
use tracing::debug;

/// Error of [`get_current_client_version`]: a failed request, or a message for an internal error.
#[derive(Debug, thiserror::Error)]
pub enum ClientVersionError {
    #[error(transparent)]
    Request(#[from] reqwest::Error),
    #[error("{0}")]
    Internal(String),
}

impl ClientVersionError {
    fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }
}

#[derive(serde::Deserialize)]
struct SteamClientVersionResponse {
    result: SteamClientVersionResult,
}

#[derive(serde::Deserialize)]
struct SteamClientVersionResult {
    success: bool,
    min_allowed_version: Option<u32>,
}

/// Get the current client version from the Steam API, falling back to a GitHub mirror of
/// `steam.inf`.
#[cached(
    ttl_secs = 300,
    convert = "{ 0 }",
    key = "u8",
    result_fallback = true,
    companions_vis = ""
)]
pub async fn get_current_client_version(
    http_client: &reqwest::Client,
) -> Result<u32, ClientVersionError> {
    // Try the official Steam API first
    if let Ok(version) = get_client_version_from_steam_api(http_client).await {
        return Ok(version);
    }

    // Fall back to GitHub repo
    debug!("Steam API failed, falling back to GitHub for client version");
    get_client_version_from_github(http_client).await
}

async fn get_client_version_from_steam_api(
    http_client: &reqwest::Client,
) -> Result<u32, ClientVersionError> {
    let response: SteamClientVersionResponse = http_client
        .get("https://api.steampowered.com/IGCVersion_1422450/GetClientVersion/v1/")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .and_then(Response::error_for_status)
        .map_err(|e| {
            ClientVersionError::internal(format!(
                "Failed to fetch client version from Steam API: {e}"
            ))
        })?
        .json()
        .await
        .map_err(|e| {
            ClientVersionError::internal(format!("Failed to parse Steam API response: {e}"))
        })?;

    if !response.result.success {
        return Err(ClientVersionError::internal(
            "Steam API returned success=false",
        ));
    }

    response.result.min_allowed_version.ok_or_else(|| {
        ClientVersionError::internal("Steam API response missing min_allowed_version")
    })
}

async fn get_client_version_from_github(
    http_client: &reqwest::Client,
) -> Result<u32, ClientVersionError> {
    let steam_info = http_client
        .get("https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/steam.inf")
        .send()
        .await
        .and_then(Response::error_for_status)?
        .text().await?;
    let version = steam_info
        .lines()
        .find_map(|line| line.strip_prefix("ClientVersion="))
        .ok_or_else(|| ClientVersionError::internal("Failed to fetch client version"))?;
    version
        .parse()
        .map_err(|_not_a_number| ClientVersionError::internal("Failed to parse client version"))
}
