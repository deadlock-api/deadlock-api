use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::Serialize;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcGetRankData, CMsgGcToClientGetRankDataResponse, EgcCitadelClientMessages,
};

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::{
    SteamProxyQuery, SteamProxyRawResponse, SteamProxyResponse, SteamProxyResult,
};

#[derive(Debug, Clone, Serialize, ToSchema)]
struct RankData {
    current_rank_confidence: Option<i32>,
    calibrated_rank_confidence: Option<i32>,
    requires_calibration: Option<bool>,
}

impl From<CMsgGcToClientGetRankDataResponse> for RankData {
    fn from(value: CMsgGcToClientGetRankDataResponse) -> Self {
        Self {
            current_rank_confidence: value.current_rank_confidence,
            calibrated_rank_confidence: value.calibrated_rank_confidence,
            requires_calibration: value.requires_calibration,
        }
    }
}

#[cached(
    ty = "TimedCache<u8, SteamProxyRawResponse>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_raw(steam_client: &SteamClient) -> SteamProxyResult<SteamProxyRawResponse> {
    steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetRankData,
            msg: CMsgClientToGcGetRankData {},
            in_all_groups: Some(vec!["LowRateLimitApis".to_owned()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(10),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await
}

#[utoipa::path(
    get,
    path = "/rank-data",
    responses(
        (status = OK, body = RankData),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching rank data failed")
    ),
    tags = ["Info"],
    summary = "Rank Data",
    description = "
This endpoint returns the rank data.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn rank_data(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    let raw_data = fetch_raw(&state.steam_client).await?;
    let proto_msg: SteamProxyResponse<CMsgGcToClientGetRankDataResponse> = raw_data.try_into()?;
    let rank_data: RankData = proto_msg.msg.into();
    Ok(Json(rank_data))
}
