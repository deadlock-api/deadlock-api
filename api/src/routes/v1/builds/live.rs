use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use chrono::{DateTime, NaiveDateTime};
use serde::Deserialize;
use sqlx::QueryBuilder;
use tracing::warn;
use utoipa::IntoParams;
use valveprotos::deadlock::c_msg_client_to_gc_find_hero_builds_response::HeroBuildResult;
use valveprotos::deadlock::{
    CMsgClientToGcFindHeroBuilds, CMsgClientToGcFindHeroBuildsResponse, EgcCitadelClientMessages,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::builds::structs::Build;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::types::{SteamProxyQuery, SteamProxyResponse};
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct LiveBuildPath {
    /// The hero ID of the build. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: u32,
    /// The build ID to fetch.
    build_id: u32,
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub(super) struct LiveBuildQuery {
    /// Fetch the build from the Game Coordinator even if it is already in the database.
    #[serde(default)]
    force_refetch: bool,
}

async fn fetch_build_from_db(
    pg_client: &sqlx::Pool<sqlx::Postgres>,
    hero_id: u32,
    build_id: u32,
) -> sqlx::Result<Option<Build>> {
    #[expect(clippy::cast_possible_wrap)]
    let row: Option<sqlx::types::Json<Build>> = sqlx::query_scalar(
        "SELECT data FROM hero_builds WHERE hero = $1 AND build_id = $2 ORDER BY version DESC LIMIT 1",
    )
    .bind(hero_id as i32)
    .bind(build_id as i32)
    .fetch_optional(pg_client)
    .await?;
    Ok(row.map(|r| r.0))
}

fn ts_to_pg(unix_ts: u32) -> Option<NaiveDateTime> {
    DateTime::from_timestamp(i64::from(unix_ts), 0).map(|d| d.naive_utc())
}

#[expect(clippy::cast_possible_wrap)]
async fn insert_builds(
    pg_client: &sqlx::Pool<sqlx::Postgres>,
    builds: &[HeroBuildResult],
) -> sqlx::Result<()> {
    let rows: Vec<_> = builds
        .iter()
        .filter_map(|build| {
            let data = serde_json::to_value(build).ok()?;
            let hero_build = build.hero_build.as_ref()?;
            Some((build, hero_build, data))
        })
        .collect();
    if rows.is_empty() {
        return Ok(());
    }

    let mut query = QueryBuilder::new(
        "INSERT INTO hero_builds(hero, build_id, version, author_id, weekly_favorites, favorites, \
         ignores, reports, rollup_category, language, updated_at, published_at, data)",
    );
    query.push_values(rows, |mut b, (build, hero_build, data)| {
        b.push_bind(hero_build.hero_id.unwrap_or_default() as i32)
            .push_bind(hero_build.hero_build_id.unwrap_or_default() as i32)
            .push_bind(hero_build.version.unwrap_or_default() as i32)
            .push_bind(hero_build.author_account_id.map(|x| x as i32))
            .push_bind(build.num_weekly_favorites.unwrap_or_default() as i32)
            .push_bind(build.num_favorites.unwrap_or_default() as i32)
            .push_bind(build.num_ignores.unwrap_or_default() as i32)
            .push_bind(build.num_reports.unwrap_or_default() as i32)
            .push_bind(build.rollup_category.map(|x| x as i32))
            .push_bind(hero_build.language.map(|x| x as i32))
            .push_bind(hero_build.last_updated_timestamp.and_then(ts_to_pg))
            .push_bind(hero_build.publish_timestamp.and_then(ts_to_pg))
            .push_bind(data);
    });
    query.push(
        " ON CONFLICT(hero, build_id, version) DO UPDATE SET author_id = EXCLUDED.author_id, \
         weekly_favorites = EXCLUDED.weekly_favorites, rollup_category = \
         EXCLUDED.rollup_category, favorites = EXCLUDED.favorites, ignores = EXCLUDED.ignores, \
         reports = EXCLUDED.reports, language = EXCLUDED.language, updated_at = \
         EXCLUDED.updated_at, published_at = EXCLUDED.published_at, data = EXCLUDED.data",
    );
    query.build().execute(pg_client).await?;
    Ok(())
}

async fn fetch_and_store_builds(
    state: &AppState,
    msg: CMsgClientToGcFindHeroBuilds,
) -> APIResult<Vec<HeroBuildResult>> {
    let response: SteamProxyResponse<CMsgClientToGcFindHeroBuildsResponse> =
        tryhard::retry_fn(|| {
            state.steam_client.call_steam_proxy(SteamProxyQuery {
                msg_type: EgcCitadelClientMessages::KEMsgClientToGcFindHeroBuilds,
                msg: msg.clone(),
                in_all_groups: None,
                in_any_groups: None,
                cooldown_time: Duration::from_secs(5),
                soft_cooldown_millis: None,
                request_timeout: Duration::from_secs(5),
                username: None,
            })
        })
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await?;

    let results = response.msg.results;
    if let Err(e) = insert_builds(&state.pg_client, &results).await {
        warn!("Failed to insert live fetched builds into Postgres: {e}");
    }
    Ok(results)
}

fn to_build(result: &HeroBuildResult) -> APIResult<Build> {
    Ok(serde_json::from_value(serde_json::to_value(result)?)?)
}

#[utoipa::path(
    get,
    path = "/{hero_id}/{build_id}",
    params(LiveBuildPath, LiveBuildQuery),
    responses(
        (status = OK, body = Build),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "Build not found"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching build failed")
    ),
    tags = ["Builds"],
    summary = "Fetch Live",
    description = "
Returns a single build. If the build is already in our database it is served from there, otherwise it is
fetched live from the Deadlock Game Coordinator and stored in the database.

Set `force_refetch=true` to always fetch from the Game Coordinator, e.g. to pick up a newer version.

Rate limits only apply when the build is fetched from the Game Coordinator.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGCFindHeroBuilds
- CMsgClientToGCFindHeroBuildsResponse

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 20req/min |
| Key | 100req/min |
| Global | 500req/min |
    "
)]
pub(super) async fn fetch_build_live(
    Path(LiveBuildPath { hero_id, build_id }): Path<LiveBuildPath>,
    Query(LiveBuildQuery { force_refetch }): Query<LiveBuildQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if !force_refetch
        && let Some(build) = fetch_build_from_db(&state.pg_client, hero_id, build_id).await?
    {
        return Ok(Json(build));
    }

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "builds_live",
            &[
                Quota::ip_limit(20, Duration::from_mins(1)),
                Quota::key_limit(100, Duration::from_mins(1)),
                Quota::global_limit(500, Duration::from_mins(1)),
            ],
        )
        .await?;

    let msg = CMsgClientToGcFindHeroBuilds {
        hero_id: Some(hero_id),
        language: vec![0],
        hero_build_id: Some(build_id),
        ..Default::default()
    };
    let results = fetch_and_store_builds(&state, msg).await?;
    let build = results
        .iter()
        .filter(|b| b.hero_build.is_some())
        .max_by_key(|b| b.hero_build.as_ref().and_then(|h| h.version))
        .ok_or_else(|| APIError::status_msg(StatusCode::NOT_FOUND, "Build not found"))?;
    Ok(Json(to_build(build)?))
}

#[utoipa::path(
    get,
    path = "/by-author/{account_id}",
    params(AccountIdQuery),
    responses(
        (status = OK, body = [Build]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching builds failed")
    ),
    tags = ["Builds"],
    summary = "Fetch Live by Author",
    description = "
Fetches all builds of an author directly from the Deadlock Game Coordinator and stores them in the database.

Unlike the search endpoint, this does not rely on builds already being in our database, so it can be used to
look up builds that have not been crawled yet. Every fetched build is upserted into the database.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGCFindHeroBuilds
- CMsgClientToGCFindHeroBuildsResponse

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 20req/min |
| Key | 100req/min |
| Global | 500req/min |
    "
)]
pub(super) async fn fetch_builds_by_author_live(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "builds_live",
            &[
                Quota::ip_limit(20, Duration::from_mins(1)),
                Quota::key_limit(100, Duration::from_mins(1)),
                Quota::global_limit(500, Duration::from_mins(1)),
            ],
        )
        .await?;

    let msg = CMsgClientToGcFindHeroBuilds {
        author_account_id: Some(account_id),
        ..Default::default()
    };
    let results = fetch_and_store_builds(&state, msg).await?;
    let builds = results
        .iter()
        .filter(|b| b.hero_build.is_some())
        .map(to_build)
        .collect::<APIResult<Vec<_>>>()?;
    Ok(Json(builds))
}
