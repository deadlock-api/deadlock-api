//! Shared query types and helpers for `/v1/assets/*` endpoints.

use axum::Json;
use reqwest::StatusCode;
use serde::Deserialize;
use strum::IntoStaticStr;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};

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

/// Query params for `/v1/assets/*` endpoints that take only a client version.
#[derive(Debug, Default, Deserialize, IntoParams)]
pub(crate) struct VersionQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    pub(crate) client_version: Option<u32>,
}

/// Set of languages the upstream `localization/<lang>.json` files are keyed by.
#[derive(Debug, Default, Clone, Copy, Deserialize, IntoStaticStr, utoipa::ToSchema)]
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
