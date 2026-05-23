use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde::Deserialize;
use strum::IntoStaticStr;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::assets::versions::heroes::{self, HeroV2};

/// Set of languages the upstream `localization/<lang>.json` files are
/// keyed by. Matches the python `Language` enum.
#[derive(Debug, Clone, Copy, Deserialize, IntoStaticStr, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[allow(clippy::enum_variant_names)]
pub(crate) enum Language {
    Brazilian,
    Bulgarian,
    Czech,
    Danish,
    Dutch,
    English,
    Finnish,
    French,
    German,
    Greek,
    Hungarian,
    Indonesian,
    Italian,
    Japanese,
    Koreana,
    Latam,
    Norwegian,
    Polish,
    Portuguese,
    Romanian,
    Russian,
    Schinese,
    Spanish,
    Swedish,
    Tchinese,
    Thai,
    Turkish,
    Ukrainian,
    Vietnamese,
}

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct HeroesQuery {
    /// Language code. Defaults to `english`.
    #[serde(default)]
    language: Option<Language>,
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
    /// When true, hides heroes that aren't player-selectable or are disabled / in-development.
    #[serde(default)]
    only_active: Option<bool>,
}

#[utoipa::path(
    get,
    path = "/",
    params(HeroesQuery),
    responses(
        (status = OK, body = [HeroV2]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Heroes"],
    summary = "List Heroes",
    description = "Returns the per-hero metadata used by the game client, parsed from the patch's KV3 source files."
)]
pub(super) async fn list_heroes(
    State(state): State<AppState>,
    Query(q): Query<HeroesQuery>,
) -> APIResult<impl IntoResponse> {
    let heroes = load_heroes(&state, q.client_version, q.language).await?;
    // Filter at request time so the underlying cache entry is shared between
    // `only_active=true` and `only_active=false` callers.
    if q.only_active.unwrap_or(false) {
        let filtered: Vec<HeroV2> = heroes
            .iter()
            .filter(|h| h.player_selectable && !h.disabled && !h.in_development)
            .cloned()
            .collect();
        Ok(Json(filtered).into_response())
    } else {
        Ok(Json(heroes).into_response())
    }
}

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct HeroQuery {
    #[serde(default)]
    language: Option<Language>,
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/{hero_id}",
    params(
        ("hero_id" = u32, Path, description = "Hero id (`m_HeroID`)"),
        HeroQuery,
    ),
    responses(
        (status = OK, body = HeroV2),
        (status = NOT_FOUND, description = "Unknown hero id or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Heroes"],
    summary = "Get Hero",
    description = "Returns a single hero by id."
)]
pub(super) async fn get_hero(
    State(state): State<AppState>,
    Path(hero_id): Path<u32>,
    Query(q): Query<HeroQuery>,
) -> APIResult<impl IntoResponse> {
    let heroes = load_heroes(&state, q.client_version, q.language).await?;
    heroes
        .iter()
        .find(|h| h.id == hero_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(StatusCode::NOT_FOUND, format!("Unknown hero id: {hero_id}"))
        })
}

/// Resolve the requested version, then hand off to the cached service.
///
/// Returns the cached `Arc<Vec<HeroV2>>` directly so concurrent requests for
/// the same `(version, language)` share a single underlying allocation. The
/// caller filters by `only_active` / `hero_id` at request time.
async fn load_heroes(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> APIResult<std::sync::Arc<Vec<HeroV2>>> {
    state
        .version_store
        .ensure_loaded(&state.r2_client)
        .await
        .map_err(|e| APIError::internal(format!("version listing: {e}")))?;

    let version = match client_version {
        Some(v) => {
            if !state.version_store.contains(v) {
                // Cached list is at most 15 minutes old. A just-published
                // patch won't appear until the next background refresh, so
                // do a one-shot singleflighted refresh before 404'ing.
                if let Err(e) = state.version_store.refresh_now(&state.r2_client).await {
                    tracing::warn!("On-demand version refresh failed: {e}");
                }
                if !state.version_store.contains(v) {
                    return Err(APIError::status_msg(
                        StatusCode::NOT_FOUND,
                        format!("Unknown client_version: {v}"),
                    ));
                }
            }
            v
        }
        None => state
            .version_store
            .latest()
            .ok_or_else(|| APIError::internal("no versions available"))?,
    };

    let lang: &'static str = language.unwrap_or(Language::English).into();
    heroes::fetch_heroes(&state.r2_client, version, lang)
        .await
        .map_err(|e| APIError::internal(format!("building heroes: {e}")))
}
