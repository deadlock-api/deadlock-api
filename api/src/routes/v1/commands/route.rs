use core::time::Duration;
use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use strum::VariantArray as _;
use tracing::warn;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::commands::variables::{ResolverContext, Variable, VariableCategory};
use crate::routes::v1::leaderboard::types::LeaderboardRegion;
use crate::routes::v1::players::ensure_not_protected;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{DOCUMENTED_DEFAULT, Quota, RateLimit, Scope, describe};
use crate::utils::parse::parse_steam_id;

const RATE_LIMIT: RateLimit = RateLimit::new(
    "command",
    &[
        Quota::new(Scope::Ip, 60, Duration::from_mins(1)),
        Quota::new(Scope::Global, 300, Duration::from_mins(1)),
    ],
);

#[derive(Debug, Clone, Serialize, ToSchema)]
struct VariableDescription {
    /// The name of the variable.
    name: String,
    /// The description of the variable.
    description: String,
    /// The default label for the variable.
    default_label: Option<String>,
    /// Extra arguments that can be passed to the variable.
    extra_args: Vec<String>,
    /// The category of the variable.
    category: VariableCategory,
}

impl From<Variable> for VariableDescription {
    fn from(v: Variable) -> Self {
        Self {
            name: v.get_name().to_owned(),
            description: v.get_description().to_owned(),
            default_label: v.get_default_label().map(str::to_owned),
            extra_args: v.extra_args(),
            category: v.get_category(),
        }
    }
}

#[utoipa::path(
    get,
    path = "/variables/available",
    responses(
        (status = OK, body = [VariableDescription]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
    ),
    tags = ["Commands"],
    summary = "Available Variables",
    description = describe(
        "
Returns a list of available variables that can be used in the command endpoint.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn available_variables() -> APIResult<impl IntoResponse> {
    let variable_descriptions = Variable::VARIANTS
        .iter()
        .copied()
        .filter(|v| !v.is_deprecated())
        .map_into::<VariableDescription>()
        .collect_vec();
    Ok(Json(variable_descriptions))
}

#[utoipa::path(
    get,
    path = "/widgets/versions",
    responses(
        (status = OK, body = HashMap<String, i32>),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
    ),
    tags = ["Commands"],
    summary = "Widget Versions",
    description = describe(
        "
Returns a map of str->int of widget versions.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn widget_versions() -> APIResult<impl IntoResponse> {
    let data = tokio::fs::read("widget_versions.json").await?;
    let versions: HashMap<String, i32> = serde_json::from_slice(&data)?;
    Ok(Json(versions))
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub(super) struct CommandResolveQuery {
    /// The players region
    #[serde(default)]
    #[param(inline)]
    region: LeaderboardRegion,
    /// The players `SteamID3`
    #[serde(deserialize_with = "parse_steam_id")]
    account_id: u32,
    /// The command template to resolve
    #[serde(default)]
    template: String,
    /// Hero name to check for hero specific stats
    #[serde(default)]
    hero_name: Option<String>,
}

#[utoipa::path(
    get,
    params(CommandResolveQuery),
    path = "/resolve",
    responses(
        (status = OK, body = String),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
    ),
    tags = ["Commands"],
    summary = "Resolve Command",
    description = describe(
        "
    Resolves a command and returns the resolved command.

    ",
        RATE_LIMIT,
    )
)]
pub(super) async fn command_resolve(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Query(query): Query<CommandResolveQuery>,
) -> APIResult<String> {
    if query.account_id == 0 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid account ID",
        ));
    }
    let variables_needed = Variable::VARIANTS
        .iter()
        .filter(|v| query.template.contains(&format!("{{{}}}", v.get_name())))
        .collect_vec();
    let resolved = resolve_variables(
        &rate_limit_key,
        &state,
        query.account_id,
        query.region,
        query.hero_name,
        &variables_needed,
    )
    .await?;

    let mut resolved_template = query.template;
    for (variable, value) in resolved {
        resolved_template =
            resolved_template.replace(&format!("{{{}}}", variable.get_name()), &value);
    }
    Ok(resolved_template)
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub(super) struct VariablesResolveQuery {
    #[serde(default)]
    #[param(inline)]
    region: LeaderboardRegion,
    #[serde(deserialize_with = "parse_steam_id")]
    account_id: u32,
    /// Variables to resolve, separated by commas.
    #[serde(default)]
    variables: String,
    /// Hero name to check for hero specific stats
    #[serde(default)]
    hero_name: Option<String>,
}

#[utoipa::path(
    get,
    params(VariablesResolveQuery),
    path = "/variables/resolve",
    responses(
        (status = OK, body = HashMap<String, String>),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
    ),
    tags = ["Commands"],
    summary = "Resolve Variables",
    description = describe(
        "
Resolves variables and returns a map of variable name to resolved value.

    ",
        RATE_LIMIT,
    )
)]
pub(super) async fn variables_resolve(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Query(query): Query<VariablesResolveQuery>,
) -> APIResult<Json<HashMap<String, String>>> {
    if query.account_id == 0 || query.variables.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid account ID or no variables provided",
        ));
    }
    let variables_to_resolve = query.variables.split(',').map(str::trim).collect_vec();
    let variables_needed = Variable::VARIANTS
        .iter()
        .filter(|v| variables_to_resolve.contains(&v.get_name()))
        .collect_vec();
    let resolved = resolve_variables(
        &rate_limit_key,
        &state,
        query.account_id,
        query.region,
        query.hero_name,
        &variables_needed,
    )
    .await?;

    Ok(Json(
        resolved
            .into_iter()
            .map(|(variable, value)| (variable.get_name().to_owned(), value))
            .collect(),
    ))
}

/// Rate-limits the request, then resolves `variables` concurrently. A variable that fails to
/// resolve is logged and left out.
async fn resolve_variables(
    rate_limit_key: &RateLimitKey,
    state: &AppState,
    account_id: u32,
    region: LeaderboardRegion,
    hero_name: Option<String>,
    variables: &[&'static Variable],
) -> APIResult<Vec<(&'static Variable, String)>> {
    state
        .rate_limit_client
        .check(rate_limit_key, RATE_LIMIT)
        .await?;
    ensure_not_protected(state, &[account_id]).await?;

    let extra_args: HashMap<String, String> = hero_name
        .map(|hero_name| ("hero_name".to_owned(), hero_name))
        .into_iter()
        .collect();
    let extra_args = &extra_args;
    let context = &ResolverContext::new(variables, state, account_id).await;

    Ok(
        futures::future::join_all(variables.iter().map(|&v| async move {
            match v
                .resolve(
                    rate_limit_key,
                    state,
                    account_id,
                    region,
                    extra_args,
                    context,
                )
                .await
            {
                Ok(resolved) => Some((v, resolved)),
                Err(e) => {
                    warn!("Failed to resolve variable: {}, {e}", v.get_name());
                    None
                }
            }
        }))
        .await
        .into_iter()
        .flatten()
        .collect(),
    )
}
