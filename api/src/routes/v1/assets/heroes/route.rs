use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{Language, resolve_version};
use crate::services::assets::versions::heroes::{self, HeroV2};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct HeroesQuery {
    /// Language code. Defaults to `english`.
    #[serde(default)]
    #[param(inline)]
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
    #[param(inline)]
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

#[utoipa::path(
    get,
    path = "/by-name/{name}",
    params(
        ("name" = String, Path, description = "Hero class name (e.g. `hero_atlas`) or short name (e.g. `atlas`)"),
        HeroQuery,
    ),
    responses(
        (status = OK, body = HeroV2),
        (status = NOT_FOUND, description = "Unknown hero name or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Heroes"],
    summary = "Get Hero By Name",
    description = "Returns a single hero by `class_name` or display `name`. Matches the bare value as well as the `hero_`-prefixed form."
)]
pub(super) async fn get_hero_by_name(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<HeroQuery>,
) -> APIResult<impl IntoResponse> {
    let heroes = load_heroes(&state, q.client_version, q.language).await?;
    let needle = name.to_lowercase();
    let prefixed = format!("hero_{needle}");
    heroes
        .iter()
        .find(|h| {
            let cn = h.class_name.to_lowercase();
            let n = h.name.to_lowercase();
            cn == needle || cn == prefixed || n == needle || n == prefixed
        })
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(StatusCode::NOT_FOUND, format!("Unknown hero name: {name}"))
        })
}

/// Returns the cached `Arc<Vec<HeroV2>>` directly so concurrent requests for
/// the same `(version, language)` share a single underlying allocation. The
/// caller filters by `only_active` / `hero_id` at request time.
async fn load_heroes(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> APIResult<std::sync::Arc<Vec<HeroV2>>> {
    let version = resolve_version(state, client_version).await?;
    let lang = language.unwrap_or(Language::English).as_str();
    heroes::fetch_heroes(&state.r2_client, version, lang)
        .await
        .map_err(|e| APIError::internal(format!("building heroes: {e}")))
}
