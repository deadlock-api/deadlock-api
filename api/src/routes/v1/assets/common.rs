//! Shared query types and helpers for `/v1/assets/*` endpoints.

use reqwest::StatusCode;
use serde::Deserialize;
use strum::IntoStaticStr;

use crate::context::AppState;
use crate::error::{APIError, APIResult};

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
