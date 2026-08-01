use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::IntoResponse;
use cached::macros::cached;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::types::AccountIdQuery;

/// Convert a raw badge value (11–116) to a 1-based contiguous index (1–66).
///
/// Formula: `(badge / 10 - 1) * 6 + badge % 10`
/// e.g. badge 82 → (8-1)*6 + 2 = 44
fn badge_to_idx(badge: i32) -> i32 {
    (badge / 10 - 1) * 6 + badge % 10
}

/// Convert a badge index (1..=66) back to a badge ID.
///
/// Tiers 1–11, 6 sub-ranks each. Index 1 → badge 11, index 66 → badge 116.
/// Out-of-range values are clamped.
fn idx_to_badge(idx: i32) -> i32 {
    let idx = idx.clamp(1, 66);
    10 * ((idx - 1) / 6) + 11 + (idx - 1) % 6
}

#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct RankPredictResponse {
    /// Rank badge, `tier * 10 + subrank`. `0` when no recent ranked match reports a rank.
    /// See more: <https://api.deadlock-api.com/v1/assets/ranks>
    pub(crate) badge: u32,
    /// Rank tier, `0` when unknown.
    pub(crate) rank: u32,
    /// Sub-rank within the tier, `0` when unknown.
    pub(crate) subrank: u32,
}

/// `initial_display_rank` is `0` while the player is still in placement games and is only set on
/// ranked matches. Restricting the scan to the player's recent ranked matches keeps the query off a
/// full `account_id` scan, which the `(match_id, account_id)` sort key can't serve.
///
/// Returns `None` when none of those matches carries a rank.
#[cached(
    ttl = 600,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
pub(crate) async fn fetch_last_ranked_match_badge(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> Result<Option<u32>, APIError> {
    ch_client
        .query(
            "
            SELECT assumeNotNull(player_rank_initial_display_rank)
            FROM match_player
            WHERE
                account_id = ?
                AND match_id IN (
                    SELECT match_id
                    FROM match_player
                    WHERE account_id = ? AND match_mode = 'Ranked'
                    ORDER BY match_id DESC
                    LIMIT 20
                )
                AND player_rank_initial_display_rank > 0
            ORDER BY match_id DESC
            LIMIT 1
            SETTINGS log_comment = 'rank_predict', apply_patch_parts = 0
            ",
        )
        .bind(account_id)
        .bind(account_id)
        .fetch_optional()
        .await
        .map_err(|e| APIError::internal(format!("ClickHouse query failed: {e}")))
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank-predict",
    params(AccountIdQuery),
    responses(
        (status = OK, body = RankPredictResponse),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank",
    description = "
Returns the player's rank as Valve reported it on their latest ranked match.

Only ranked matches carry a rank, and it stays unset while the player is in placement games.
When none of the player's recent ranked matches reports a rank, `badge`, `rank` and `subrank` are
all `0`, which is the `Obscurus` (unranked) tier.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
"
)]
pub(super) async fn rank_predict(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<Json<RankPredictResponse>> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let badge = fetch_last_ranked_match_badge(&state.ch_client_ro, account_id)
        .await?
        .unwrap_or_default();

    Ok(Json(RankPredictResponse {
        badge,
        rank: badge / 10,
        subrank: badge % 10,
    }))
}

#[derive(Debug, Default, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankPredictImageFormat {
    #[default]
    Png,
    Webp,
}

impl RankPredictImageFormat {
    fn suffix(self) -> &'static str {
        match self {
            Self::Png => "",
            Self::Webp => "_webp",
        }
    }
}

#[derive(Debug, Default, Deserialize, utoipa::IntoParams)]
pub(crate) struct RankPredictImageQuery {
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    format: RankPredictImageFormat,
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank-predict/image",
    params(AccountIdQuery, RankPredictImageQuery),
    responses(
        (status = OK, description = "Rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = NOT_FOUND, description = "No image available for the rank"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Image",
    description = "Returns the rank badge image directly (binary), not a URL. Players whose recent ranked matches carry no rank get the `Obscurus` image. Use `?format=webp` for WebP."
)]
pub(super) async fn rank_predict_image(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(RankPredictImageQuery { format }): Query<RankPredictImageQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let badge = fetch_last_ranked_match_badge(&state.ch_client_ro, account_id)
        .await?
        .unwrap_or_default();
    serve_rank_image(&state, badge, format).await
}

async fn serve_rank_image(
    state: &AppState,
    badge: u32,
    format: RankPredictImageFormat,
) -> APIResult<(HeaderMap, Bytes)> {
    let rank = badge / 10;
    let suffix = format.suffix();

    let image_url = state
        .assets_client
        .fetch_ranks()
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch ranks: {e}")))?
        .iter()
        .find(|r| r.tier == rank)
        .and_then(|r| r.images.get(&format!("large{suffix}")).cloned())
        .ok_or_else(|| {
            APIError::status_msg(StatusCode::NOT_FOUND, "No image available for the rank.")
        })?;

    let response = reqwest::get(&image_url)
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch rank image: {e}")))?;

    if !response.status().is_success() {
        return Err(APIError::internal(format!(
            "Rank image request failed with status {}",
            response.status()
        )));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_owned();

    let bytes: Bytes = response
        .bytes()
        .await
        .map_err(|e| APIError::internal(format!("Failed to read rank image bytes: {e}")))?;

    let mut headers = HeaderMap::new();
    if let Ok(value) = content_type.parse() {
        headers.insert(header::CONTENT_TYPE, value);
    }
    Ok((headers, bytes))
}

const MAX_AVG_ACCOUNT_IDS: usize = 12;

fn deserialize_account_ids<'de, D>(deserializer: D) -> Result<Vec<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = String::deserialize(deserializer)?;
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.parse::<u32>().map_err(serde::de::Error::custom))
        .collect()
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub(crate) struct RankPredictAvgImageQuery {
    /// Comma-separated list of account IDs (max 12).
    #[serde(deserialize_with = "deserialize_account_ids")]
    account_ids: Vec<u32>,
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    format: RankPredictImageFormat,
}

#[utoipa::path(
    get,
    path = "/rank-predict/image",
    params(RankPredictAvgImageQuery),
    responses(
        (status = OK, description = "Average rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid or missing account IDs"),
        (status = FORBIDDEN, description = "One of the users is protected"),
        (status = NOT_FOUND, description = "No image available for the rank"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Avg Image",
    description = "Returns the average rank badge image (binary) for a comma-separated list of account IDs. Accounts without a rank are left out of the average; if none of them has one, the `Obscurus` image is returned. Use `?format=webp` for WebP."
)]
pub(super) async fn rank_predict_avg_image(
    Query(RankPredictAvgImageQuery {
        account_ids,
        format,
    }): Query<RankPredictAvgImageQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if account_ids.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "At least one account ID is required.",
        ));
    }
    if account_ids.len() > MAX_AVG_ACCOUNT_IDS {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Too many account IDs (max {MAX_AVG_ACCOUNT_IDS})."),
        ));
    }

    let unique_ids: Vec<u32> = account_ids.into_iter().unique().collect();

    for &account_id in &unique_ids {
        if state
            .steam_client
            .is_user_protected(&state.pg_client, account_id)
            .await?
        {
            return Err(APIError::protected_user());
        }
    }

    let badges: Vec<u32> = futures::future::try_join_all(
        unique_ids
            .iter()
            .map(|&account_id| fetch_last_ranked_match_badge(&state.ch_client_ro, account_id)),
    )
    .await?
    .into_iter()
    .flatten()
    .collect();

    // Badge values are not contiguous (16 is followed by 21), so the average is taken over the
    // badge index rather than the badge itself.
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
    let avg_badge = if badges.is_empty() {
        0
    } else {
        let sum: i32 = badges.iter().map(|&b| badge_to_idx(b.cast_signed())).sum();
        idx_to_badge((f64::from(sum) / badges.len() as f64).round() as i32).cast_unsigned()
    };

    serve_rank_image(&state, avg_badge, format).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_idx_to_badge_boundaries() {
        assert_eq!(idx_to_badge(1), 11);
        assert_eq!(idx_to_badge(6), 16);
        assert_eq!(idx_to_badge(7), 21);
        assert_eq!(idx_to_badge(66), 116);
        assert_eq!(idx_to_badge(0), 11);
        assert_eq!(idx_to_badge(67), 116);
    }

    #[test]
    fn test_badge_to_idx() {
        assert_eq!(badge_to_idx(11), 1);
        assert_eq!(badge_to_idx(16), 6);
        assert_eq!(badge_to_idx(21), 7);
        assert_eq!(badge_to_idx(82), 44);
        assert_eq!(badge_to_idx(116), 66);
    }

    #[test]
    fn test_badge_idx_roundtrip() {
        for idx in 1..=66 {
            let badge = idx_to_badge(idx);
            assert_eq!(badge_to_idx(badge), idx);
        }
    }
}
