use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::commands::variables::{Variable, VariableCategory};
use crate::routes::v1::leaderboard::types::LeaderboardRegion;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::parse::parse_steam_id;
use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use strum::VariantArray;
use tracing::warn;
use utoipa::{IntoParams, ToSchema};

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
            name: v.get_name().to_string(),
            description: v.get_description().to_string(),
            default_label: v.get_default_label().map(|l| l.to_string()),
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
    description = r#"
Returns a list of available variables that can be used in the command endpoint.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#
)]
pub(super) async fn available_variables() -> APIResult<impl IntoResponse> {
    let variable_descriptions = Variable::VARIANTS
        .iter()
        .copied()
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
    description = r#"
Returns a map of str->int of widget versions.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
"#
)]
pub(super) async fn widget_versions() -> APIResult<impl IntoResponse> {
    let widget_versions_file = std::fs::File::open("widget_versions.json")?;
    Ok(serde_json::from_reader(widget_versions_file).map(|r: HashMap<String, i32>| Json(r))?)
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub(super) struct CommandResolveQuery {
    /// The players region
    #[serde(default)]
    #[param(inline)]
    region: LeaderboardRegion,
    /// The players SteamID3
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
    description = r#"
    Resolves a command and returns the resolved command.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 60req/60s |
| Key | - |
| Global | 300req/60s |
    "#
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
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "command",
            &[
                Quota::ip_limit(60, std::time::Duration::from_secs(60)),
                Quota::global_limit(300, std::time::Duration::from_secs(60)),
            ],
        )
        .await?;

    let mut extra_args = HashMap::new();
    if let Some(hero_name) = query.hero_name {
        extra_args.insert("hero_name".to_string(), hero_name);
    }
    let mut resolved_template = query.template.clone();
    let results = futures::future::join_all(
        Variable::VARIANTS
            .iter()
            .filter(|v| query.template.contains(&format!("{{{}}}", v.get_name())))
            .map(|v| {
                let template_str = format!("{{{}}}", v.get_name());
                async {
                    match v
                        .resolve(
                            &rate_limit_key,
                            &state,
                            query.account_id,
                            query.region,
                            &extra_args,
                        )
                        .await
                    {
                        Ok(resolved) => Ok((template_str, resolved)),
                        Err(e) => {
                            warn!("Failed to resolve variable: {}, {e}", v.get_name());
                            Err(format!("Failed to resolve variable: {}", v.get_name()))
                        }
                    }
                }
            }),
    )
    .await;

    for result in results {
        let Ok((template_str, resolved_variable)) = result else {
            warn!("Failed to resolve variable: {:?}", result.err());
            continue;
        };
        resolved_template = resolved_template.replace(&template_str, &resolved_variable);
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
    description = r#"
Resolves variables and returns a map of variable name to resolved value.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 60req/min |
| Key | - |
| Global | 300req/min |
    "#
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
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "command",
            &[
                Quota::ip_limit(60, std::time::Duration::from_secs(60)),
                Quota::global_limit(300, std::time::Duration::from_secs(60)),
            ],
        )
        .await?;

    let mut extra_args = HashMap::new();
    if let Some(hero_name) = query.hero_name {
        extra_args.insert("hero_name".to_string(), hero_name);
    }
    let variables_to_resolve = query.variables.split(',').map(|v| v.trim()).collect_vec();
    let results = futures::future::join_all(
        Variable::VARIANTS
            .iter()
            .filter(|v| variables_to_resolve.contains(&v.get_name()))
            .map(|v| async {
                match v
                    .resolve(
                        &rate_limit_key,
                        &state,
                        query.account_id,
                        query.region,
                        &extra_args,
                    )
                    .await
                {
                    Ok(resolved) => Some((v.get_name().to_string(), resolved)),
                    Err(e) => {
                        warn!("Failed to resolve variable: {}, {e}", v.get_name());
                        None
                    }
                }
            }),
    )
    .await
    .into_iter()
    .flatten()
    .collect::<HashMap<_, _>>();

    Ok(Json(results))
}
