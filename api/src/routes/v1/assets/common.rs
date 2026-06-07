//! Shared query types and helpers for `/v1/assets/*` endpoints.

use axum::Json;
use object_store::aws::AmazonS3;
use reqwest::StatusCode;
use serde::Deserialize;
use strum::IntoStaticStr;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::assets::versions::error::AssetsError;

/// Query params for `/v1/assets/*` endpoints that accept both a language and a
/// client version. Endpoints that don't accept a language use [`VersionQuery`].
#[derive(Debug, Default, Deserialize, IntoParams)]
pub(crate) struct AssetsQuery {
    /// Language code. Defaults to `english`.
    #[serde(default)]
    #[param(inline)]
    pub(crate) language: Option<Language>,
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    pub(crate) client_version: Option<u32>,
}

impl AssetsQuery {
    pub(crate) fn lang(&self) -> &'static str {
        self.language.unwrap_or_default().as_str()
    }
}

/// Query params for `/v1/assets/*` endpoints that take only a client version.
#[derive(Debug, Default, Deserialize, IntoParams)]
pub(crate) struct VersionQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    pub(crate) client_version: Option<u32>,
}

/// Set of languages the upstream `localization/<lang>.json` files are keyed by.
#[derive(
    Debug,
    Default,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Deserialize,
    IntoStaticStr,
    utoipa::ToSchema,
    async_graphql::Enum,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[allow(clippy::enum_variant_names)]
pub(crate) enum Language {
    Brazilian,
    Bulgarian,
    Czech,
    Danish,
    Dutch,
    #[default]
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

impl Language {
    pub(crate) fn as_str(self) -> &'static str {
        self.into()
    }
}

/// Resolve the caller's requested `client_version`, falling back to the latest
/// known version. Triggers a singleflighted on-demand refresh if an unknown
/// version is requested, so freshly-published patches don't 404 until the
/// next scheduled refresh.
pub(crate) async fn resolve_version(
    state: &AppState,
    client_version: Option<u32>,
) -> APIResult<u32> {
    state
        .version_store
        .ensure_loaded(&state.r2_client)
        .await
        .map_err(|e| APIError::internal(format!("version listing: {e}")))?;

    match client_version {
        Some(v) => {
            if !state.version_store.contains(v) {
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
            Ok(v)
        }
        None => state
            .version_store
            .latest()
            .ok_or_else(|| APIError::internal("no versions available")),
    }
}

/// Wrap an `AssetsError` from a `fetch_*` call in a 500 with the given label.
fn map_build_err(label: &'static str) -> impl FnOnce(AssetsError) -> APIError {
    move |e| APIError::internal(format!("building {label}: {e}"))
}

/// Resolve version, then call `fetch(r2, version, language)` and wrap errors.
pub(crate) async fn load_localized<T>(
    state: &AppState,
    q: &AssetsQuery,
    label: &'static str,
    fetch: impl AsyncFnOnce(&AmazonS3, u32, &str) -> Result<T, AssetsError>,
) -> APIResult<T> {
    let version = resolve_version(state, q.client_version).await?;
    fetch(&state.r2_client, version, q.lang())
        .await
        .map_err(map_build_err(label))
}

/// Resolve version, then call `fetch(r2, version)` and wrap errors.
pub(crate) async fn load_versioned<T>(
    state: &AppState,
    q: &VersionQuery,
    label: &'static str,
    fetch: impl AsyncFnOnce(&AmazonS3, u32) -> Result<T, AssetsError>,
) -> APIResult<T> {
    let version = resolve_version(state, q.client_version).await?;
    fetch(&state.r2_client, version)
        .await
        .map_err(map_build_err(label))
}

/// Find the first element matching `pred`, clone it into a `Json` response, or
/// return a 404 carrying `not_found_msg`.
pub(crate) fn find_or_404<T: Clone>(
    items: &[T],
    mut pred: impl FnMut(&T) -> bool,
    not_found_msg: impl Into<String>,
) -> APIResult<Json<T>> {
    items
        .iter()
        .find(|i| pred(i))
        .cloned()
        .map(Json)
        .ok_or_else(|| APIError::status_msg(StatusCode::NOT_FOUND, not_found_msg))
}

/// Find an element matching either a numeric id (if `needle` parses as `u32`)
/// or a case-insensitive `class_name` match.
pub(crate) fn find_by_id_or_classname<T: Clone>(
    items: &[T],
    needle: &str,
    id_of: impl Fn(&T) -> u32,
    classname_of: impl Fn(&T) -> &str,
    label: &str,
) -> APIResult<Json<T>> {
    let as_id: Option<u32> = needle.parse().ok();
    find_or_404(
        items,
        |t| as_id.is_some_and(|id| id_of(t) == id) || classname_of(t).eq_ignore_ascii_case(needle),
        format!("Unknown {label}: {needle}"),
    )
}
