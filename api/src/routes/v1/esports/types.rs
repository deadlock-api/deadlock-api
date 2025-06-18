use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Type;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Type, Debug, Clone, Serialize, Deserialize, ToSchema)]
#[sqlx(type_name = "esports_match_status")]
#[sqlx(rename_all = "lowercase")]
pub(super) enum ESportsMatchStatus {
    Live,
    Completed,
    Scheduled,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub(super) struct ESportsMatch {
    pub(super) provider: String,
    pub(super) update_id: Option<Uuid>,
    pub(super) match_id: Option<i64>,
    pub(super) team0_name: Option<String>,
    pub(super) team1_name: Option<String>,
    pub(super) team0_player_ids: Option<Vec<i32>>,
    pub(super) team1_player_ids: Option<Vec<i32>>,
    pub(super) tournament_name: Option<String>,
    pub(super) tournament_stage: Option<String>,
    pub(super) scheduled_date: Option<DateTime<Utc>>,
    pub(super) status: Option<ESportsMatchStatus>,
}
