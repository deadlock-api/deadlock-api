use std::sync::LazyLock;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::IntoResponse;
use cached::macros::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::assets::versions::common::IMAGE_BASE_URL;
use crate::utils::types::AccountIdQuery;

static RANK_IMAGE_HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

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

/// Convert Valve's flat rank progress to a badge ID.
///
/// Progress is a ladder-wide counter in fixed 1000-point steps, seven per tier, with the sixth
/// subtier spanning two of them.
fn badge_from_flat_progress(flat_progress: u32) -> u32 {
    let idx = flat_progress / 1000;
    (idx / 7 + 1) * 10 + (idx % 7 + 1).min(6)
}

/// Progress into the current subrank and the width of that subrank, both in progress points.
///
/// The sixth subtier spans two of the 1000-point steps, so it is 2000 wide.
fn subrank_progress(flat_progress: u32) -> (u32, u32) {
    let step = flat_progress / 1000 % 7;
    let progress = flat_progress % 1000 + if step == 6 { 1000 } else { 0 };
    let width = if step >= 5 { 2000 } else { 1000 };
    (progress, width)
}

/// `ClickHouse` expression equivalent to [`badge_from_flat_progress`]. `flat_progress` must be a
/// non-nullable numeric expression; it is inlined twice.
pub(crate) fn badge_from_flat_progress_sql(flat_progress: &str) -> String {
    format!(
        "toUInt32((intDiv(intDiv({flat_progress}, 1000), 7) + 1) * 10 + least(intDiv({flat_progress}, 1000) % 7 + 1, 6))"
    )
}

#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct RankResponse {
    /// Rank badge, `tier * 10 + subrank`, including the progress the last ranked match awarded.
    /// `0` when no recent ranked match reports a rank.
    /// See more: <https://api.deadlock-api.com/v1/assets/ranks>
    pub(crate) badge: u32,
    /// Rank tier, `0` when unknown.
    pub(crate) rank: u32,
    /// Sub-rank within the tier, `0` when unknown.
    pub(crate) subrank: u32,
    /// Rank metadata of the ranked match the badge was read from. `null` when none of the player's
    /// recent ranked matches reports a rank.
    pub(crate) last_match: Option<LastRankedMatch>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(crate) struct LastRankedMatch {
    pub(crate) match_id: u64,
    /// Match start time as a unix timestamp.
    pub(crate) start_time: u32,
    /// Rank badge the player entered the match with, `tier * 10 + subrank`.
    pub(crate) player_rank_initial_display_rank: u32,
    /// Rank progress the player entered the match with.
    pub(crate) player_rank_initial_flat_progress: Option<u32>,
    /// Rank progress the player ended the match with.
    pub(crate) player_rank_final_flat_progress: Option<u32>,
    /// Progress change the match was supposed to award, before demotion protection is applied.
    pub(crate) player_rank_desired_progress_change: Option<i32>,
    /// Remaining placement games at the start of the match.
    pub(crate) player_rank_initial_calibration_games: Option<u32>,
    /// Remaining demotion protection games at the start of the match.
    pub(crate) player_rank_initial_demotion_protection_games: Option<u32>,
    /// Whether the match used up one of the player's demotion protection games.
    pub(crate) player_rank_consumed_demotion_protection: Option<bool>,
    /// Win streak the player entered the match with.
    pub(crate) player_rank_initial_win_streak: Option<u32>,
}

impl LastRankedMatch {
    /// The badge the player left the match with, i.e. the badge they entered it with plus the
    /// progress the match awarded. `0` while the player is still in placement games.
    pub(crate) fn badge(&self) -> u32 {
        if self.player_rank_initial_display_rank == 0 {
            return 0;
        }
        self.player_rank_final_flat_progress.map_or(
            self.player_rank_initial_display_rank,
            badge_from_flat_progress,
        )
    }

    /// Progress into the badge from [`Self::badge`] and the width of that subrank, in progress
    /// points. `None` while the player is in placement games or when the match reports no final
    /// progress.
    pub(crate) fn progress(&self) -> Option<(u32, u32)> {
        if self.player_rank_initial_display_rank == 0 {
            return None;
        }
        self.player_rank_final_flat_progress.map(subrank_progress)
    }
}

/// `initial_display_rank` is `0` while the player is still in placement games and is only set on
/// ranked matches.
///
/// `match_player` is sorted by `(match_id, account_id)`, so filtering on `account_id` alone falls
/// back to a bloom-filter index scan that opens every one of its parts. `player_match_history` is
/// sorted by `(account_id, match_id)`, so it resolves the player's recent ranked `match_id`s with a
/// primary-key lookup; feeding those back in prunes `match_player` by partition and granule.
///
/// The window is 50 rather than 1 because `player_match_history` ingests ahead of `match_player`:
/// its newest ranked matches may not have landed in `match_player` yet (observed lead: up to 15
/// matches). Taking the newest row that exists in both keeps the result identical to scanning
/// `match_player` directly.
///
/// Returns `None` when none of those matches carries a rank.
#[cached(
    ttl = 600,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
pub(crate) async fn fetch_last_ranked_match(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> Result<Option<LastRankedMatch>, APIError> {
    ch_client
        .query(
            "
            SELECT
                match_id,
                start_time,
                assumeNotNull(player_rank_initial_display_rank) AS player_rank_initial_display_rank,
                player_rank_initial_flat_progress,
                player_rank_final_flat_progress,
                player_rank_desired_progress_change,
                player_rank_initial_calibration_games,
                player_rank_initial_demotion_protection_games,
                player_rank_consumed_demotion_protection,
                player_rank_initial_win_streak
            FROM match_player
            WHERE
                account_id = ?
                AND match_mode = 'Ranked'
                AND match_id IN (
                    SELECT match_id
                    FROM player_match_history
                    WHERE account_id = ? AND match_mode = 'Ranked'
                    ORDER BY match_id DESC
                    LIMIT 50
                )
            ORDER BY match_id DESC
            LIMIT 1
            SETTINGS log_comment = 'player_rank'
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
    path = "/{account_id}/rank",
    params(AccountIdQuery),
    responses(
        (status = OK, body = RankResponse),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank",
    description = "
Returns the player's rank at the end of their latest ranked match, i.e. the rank they entered that
match with plus the progress the match awarded. A subrank spans 1000 progress points, so a single
match can move the badge.

Only ranked matches carry a rank, and it stays unset while the player is in placement games.
When none of the player's recent ranked matches reports a rank, `badge`, `rank` and `subrank` are
all `0`, which is the `Obscurus` (unranked) tier, and `last_match` is `null`.

`last_match` carries the rank metadata Valve reported on that match, e.g. rank progress, remaining
placement games and demotion protection.
"
)]
pub(super) async fn rank(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<Json<RankResponse>> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let last_match = fetch_last_ranked_match(&state.ch_client_ro, account_id).await?;
    let badge = last_match.as_ref().map_or(0, LastRankedMatch::badge);

    Ok(Json(RankResponse {
        badge,
        rank: badge / 10,
        subrank: badge % 10,
        last_match,
    }))
}

#[derive(Debug, Default, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankImageFormat {
    #[default]
    Png,
    Webp,
}

impl RankImageFormat {
    fn suffix(self) -> &'static str {
        match self {
            Self::Png => "",
            Self::Webp => "_webp",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Webp => "webp",
        }
    }

    fn content_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Webp => "image/webp",
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankImageDisplay {
    /// Current tier badge without a division numeral (backwards compatible default).
    #[default]
    Tier,
    /// Current tier badge with the native I-VI division numeral.
    Subrank,
    /// Badge, division numeral and English name, e.g. `Oracle IV`. Obscurus is badge-only.
    Card,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankCardVariant {
    /// Compact horizontal image intended for tooltips and profile popups.
    #[default]
    Popup,
    /// Vertical image intended for a full profile page.
    Profile,
}

impl RankCardVariant {
    fn path(self) -> &'static str {
        match self {
            Self::Popup => "popup",
            Self::Profile => "profile",
        }
    }
}

#[derive(Debug, Default, Deserialize, utoipa::IntoParams)]
pub(crate) struct RankImageQuery {
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    format: RankImageFormat,
    /// Image contents. `tier` preserves the original response, `subrank` adds the native I-VI
    /// numeral, and `card` also adds the English rank name (for example `Oracle IV`).
    /// Obscurus remains badge-only because it has no ranked division.
    #[serde(default)]
    #[param(inline)]
    display: RankImageDisplay,
    /// Layout used when `display=card`. Ignored for `tier` and `subrank`.
    #[serde(default)]
    #[param(inline)]
    variant: RankCardVariant,
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank/image",
    params(AccountIdQuery, RankImageQuery),
    responses(
        (status = OK, description = "Rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = NOT_FOUND, description = "No image available for the rank"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Image",
    description = "Returns the rank image directly (binary), not a URL. Players whose recent ranked matches carry no rank get a badge-only `Obscurus` image. Use `?format=webp` for WebP, `?display=subrank` for the native I-VI numeral, or `?display=card&variant=popup|profile` for a ranked badge with an English label such as `Oracle IV`."
)]
pub(super) async fn rank_image(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<RankImageQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let badge = fetch_last_ranked_match(&state.ch_client_ro, account_id)
        .await?
        .as_ref()
        .map_or(0, LastRankedMatch::badge);
    serve_rank_image(&state, badge, query).await
}

fn generated_rank_image_url(
    badge: u32,
    format: RankImageFormat,
    display: RankImageDisplay,
    variant: RankCardVariant,
) -> Option<String> {
    let rank = badge / 10;
    let subrank = badge % 10;
    let extension = format.extension();
    let is_ranked_badge = (1..=11).contains(&rank) && (1..=6).contains(&subrank);
    match display {
        RankImageDisplay::Tier => None,
        RankImageDisplay::Subrank if is_ranked_badge => Some(format!(
            "{IMAGE_BASE_URL}/ranks/generated/badges/rank{rank:02}_subrank{subrank}.{extension}"
        )),
        RankImageDisplay::Card if is_ranked_badge || (rank == 0 && subrank == 0) => Some(format!(
            "{IMAGE_BASE_URL}/ranks/generated/cards/english/{}/rank{rank:02}_subrank{subrank}.{extension}",
            variant.path()
        )),
        RankImageDisplay::Subrank | RankImageDisplay::Card => None,
    }
}

async fn serve_rank_image(
    state: &AppState,
    badge: u32,
    query: RankImageQuery,
) -> APIResult<(HeaderMap, Bytes)> {
    let generated_response = if let Some(image_url) =
        generated_rank_image_url(badge, query.format, query.display, query.variant)
    {
        match RANK_IMAGE_HTTP_CLIENT.get(&image_url).send().await {
            Ok(candidate) if candidate.status().is_success() => Some(candidate),
            Ok(candidate) if candidate.status() == StatusCode::NOT_FOUND => None,
            Ok(candidate) => {
                return Err(APIError::internal(format!(
                    "Rank image request failed with status {}",
                    candidate.status()
                )));
            }
            Err(error) => {
                tracing::warn!(
                    %error,
                    %image_url,
                    "Failed to fetch generated rank image; using tier fallback"
                );
                None
            }
        }
    } else {
        None
    };

    let response = if let Some(response) = generated_response {
        response
    } else {
        // Look up the existing tier badge lazily: generated images remain
        // available even if the ranks metadata service is temporarily down.
        let rank = badge / 10;
        let suffix = query.format.suffix();
        let tier_url = state
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
        let fallback = RANK_IMAGE_HTTP_CLIENT
            .get(&tier_url)
            .send()
            .await
            .map_err(|e| APIError::internal(format!("Failed to fetch rank image: {e}")))?;
        if !fallback.status().is_success() {
            if fallback.status() == StatusCode::NOT_FOUND {
                return Err(APIError::status_msg(
                    StatusCode::NOT_FOUND,
                    "No image available for the rank.",
                ));
            }
            return Err(APIError::internal(format!(
                "Rank image request failed with status {}",
                fallback.status()
            )));
        }
        fallback
    };

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or(query.format.content_type())
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
pub(crate) struct RankAvgImageQuery {
    /// Comma-separated list of account IDs (max 12).
    #[serde(deserialize_with = "deserialize_account_ids")]
    account_ids: Vec<u32>,
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    format: RankImageFormat,
}

#[utoipa::path(
    get,
    path = "/rank/image",
    params(RankAvgImageQuery),
    responses(
        (status = OK, description = "Average rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid or missing account IDs"),
        (status = FORBIDDEN, description = "One of the users is protected"),
        (status = NOT_FOUND, description = "No image available for the rank"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Avg Image",
    description = "Returns the average rank badge image (binary) for a comma-separated list of account IDs. Accounts without a rank are left out of the average; if none of them has one, the `Obscurus` image is returned. Use `?format=webp` for WebP."
)]
pub(super) async fn rank_avg_image(
    Query(RankAvgImageQuery {
        account_ids,
        format,
    }): Query<RankAvgImageQuery>,
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
            .map(|&account_id| fetch_last_ranked_match(&state.ch_client_ro, account_id)),
    )
    .await?
    .into_iter()
    .flatten()
    .map(|m| m.badge())
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

    serve_rank_image(
        &state,
        avg_badge,
        RankImageQuery {
            format,
            ..RankImageQuery::default()
        },
    )
    .await
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank-predict",
    params(AccountIdQuery),
    responses(
        (status = OK, body = RankResponse),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Predict (Deprecated)",
    description = "Deprecated alias of `/v1/players/{account_id}/rank`. The rank is no longer predicted, it is read from the player's latest ranked match."
)]
#[deprecated(note = "renamed to `rank`")]
pub(super) async fn rank_predict(
    account_id: Path<AccountIdQuery>,
    state: State<AppState>,
) -> APIResult<Json<RankResponse>> {
    rank(account_id, state).await
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank-predict/image",
    params(AccountIdQuery, RankImageQuery),
    responses(
        (status = OK, description = "Rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = NOT_FOUND, description = "No image available for the rank"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Predict Image (Deprecated)",
    description = "Deprecated alias of `/v1/players/{account_id}/rank/image`. The rank is no longer predicted, it is read from the player's latest ranked match."
)]
#[deprecated(note = "renamed to `rank_image`")]
pub(super) async fn rank_predict_image(
    account_id: Path<AccountIdQuery>,
    format: Query<RankImageQuery>,
    state: State<AppState>,
) -> APIResult<impl IntoResponse> {
    rank_image(account_id, format, state).await
}

#[utoipa::path(
    get,
    path = "/rank-predict/image",
    params(RankAvgImageQuery),
    responses(
        (status = OK, description = "Average rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid or missing account IDs"),
        (status = FORBIDDEN, description = "One of the users is protected"),
        (status = NOT_FOUND, description = "No image available for the rank"),
        (status = INTERNAL_SERVER_ERROR, description = "Rank lookup failed"),
    ),
    tags = ["Players"],
    summary = "Rank Predict Avg Image (Deprecated)",
    description = "Deprecated alias of `/v1/players/rank/image`. The rank is no longer predicted, it is read from each player's latest ranked match."
)]
#[deprecated(note = "renamed to `rank_avg_image`")]
pub(super) async fn rank_predict_avg_image(
    query: Query<RankAvgImageQuery>,
    state: State<AppState>,
) -> APIResult<impl IntoResponse> {
    rank_avg_image(query, state).await
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
    fn test_badge_from_flat_progress() {
        // Subtier 6 spans two 1000-point steps, so each tier covers seven of them.
        for (progress, expected) in [
            (0, 11),
            (999, 11),
            (1_000, 12),
            (4_000, 15),
            (5_000, 16),
            (6_975, 16),
            (7_000, 21),
            (35_000, 61),
            (53_225, 85),
        ] {
            assert_eq!(badge_from_flat_progress(progress), expected, "{progress}");
        }
    }

    #[test]
    fn test_subrank_progress() {
        for (progress, expected) in [
            (0, (0, 1000)),
            (250, (250, 1000)),
            (4_600, (600, 1000)),
            // Subtier 6 spans 5_000..7_000.
            (5_000, (0, 2000)),
            (6_400, (1_400, 2000)),
            (7_000, (0, 1000)),
            (53_225, (225, 1000)),
        ] {
            assert_eq!(subrank_progress(progress), expected, "{progress}");
        }
    }

    fn last_ranked_match(initial_badge: u32, final_progress: Option<u32>) -> LastRankedMatch {
        LastRankedMatch {
            match_id: 1,
            start_time: 0,
            player_rank_initial_display_rank: initial_badge,
            player_rank_initial_flat_progress: None,
            player_rank_final_flat_progress: final_progress,
            player_rank_desired_progress_change: None,
            player_rank_initial_calibration_games: None,
            player_rank_initial_demotion_protection_games: None,
            player_rank_consumed_demotion_protection: None,
            player_rank_initial_win_streak: None,
        }
    }

    #[test]
    fn test_badge_includes_progress_made_in_the_match() {
        // Entered subrank 84 at 52_800, the match pushed them over the 53_000 line into 85.
        assert_eq!(last_ranked_match(84, Some(53_225)).badge(), 85);
        assert_eq!(last_ranked_match(85, Some(52_800)).badge(), 84);
    }

    #[test]
    fn test_badge_falls_back_and_stays_zero_in_placement() {
        assert_eq!(last_ranked_match(84, None).badge(), 84);
        assert_eq!(last_ranked_match(0, Some(53_225)).badge(), 0);
    }

    #[test]
    fn test_progress_needs_final_flat_progress_and_a_rank() {
        assert_eq!(
            last_ranked_match(84, Some(53_225)).progress(),
            Some((225, 1000))
        );
        assert_eq!(last_ranked_match(84, None).progress(), None);
        assert_eq!(last_ranked_match(0, Some(53_225)).progress(), None);
    }

    #[test]
    fn test_badge_idx_roundtrip() {
        for idx in 1..=66 {
            let badge = idx_to_badge(idx);
            assert_eq!(badge_to_idx(badge), idx);
        }
    }

    #[test]
    fn rank_image_format_has_matching_content_type() {
        assert_eq!(RankImageFormat::Png.content_type(), "image/png");
        assert_eq!(RankImageFormat::Webp.content_type(), "image/webp");
    }

    #[test]
    fn generated_subrank_image_uses_current_badge_and_division() {
        let expected = format!("{IMAGE_BASE_URL}/ranks/generated/badges/rank08_subrank4.webp");
        assert_eq!(
            generated_rank_image_url(
                84,
                RankImageFormat::Webp,
                RankImageDisplay::Subrank,
                RankCardVariant::Popup,
            )
            .as_deref(),
            Some(expected.as_str())
        );
        assert!(
            generated_rank_image_url(
                84,
                RankImageFormat::Png,
                RankImageDisplay::Tier,
                RankCardVariant::Profile,
            )
            .is_none()
        );
        assert!(
            generated_rank_image_url(
                0,
                RankImageFormat::Png,
                RankImageDisplay::Subrank,
                RankCardVariant::Popup,
            )
            .is_none()
        );
        for invalid_badge in [80, 87, 120] {
            assert!(
                generated_rank_image_url(
                    invalid_badge,
                    RankImageFormat::Webp,
                    RankImageDisplay::Subrank,
                    RankCardVariant::Popup,
                )
                .is_none()
            );
        }
    }

    #[test]
    fn generated_rank_card_selects_popup_and_profile_layouts() {
        for (variant, directory) in [
            (RankCardVariant::Popup, "popup"),
            (RankCardVariant::Profile, "profile"),
        ] {
            let expected = format!(
                "{IMAGE_BASE_URL}/ranks/generated/cards/english/{directory}/rank08_subrank4.png"
            );
            assert_eq!(
                generated_rank_image_url(
                    84,
                    RankImageFormat::Png,
                    RankImageDisplay::Card,
                    variant,
                )
                .as_deref(),
                Some(expected.as_str())
            );
        }
        let obscurus_expected =
            format!("{IMAGE_BASE_URL}/ranks/generated/cards/english/popup/rank00_subrank0.webp");
        assert_eq!(
            generated_rank_image_url(
                0,
                RankImageFormat::Webp,
                RankImageDisplay::Card,
                RankCardVariant::Popup,
            )
            .as_deref(),
            Some(obscurus_expected.as_str())
        );
        assert!(
            generated_rank_image_url(
                80,
                RankImageFormat::Webp,
                RankImageDisplay::Card,
                RankCardVariant::Popup,
            )
            .is_none()
        );
    }
}
