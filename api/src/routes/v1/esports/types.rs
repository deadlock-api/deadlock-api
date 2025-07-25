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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, sqlx::FromRow)]
pub(super) struct ESportsMatch {
    /// The provider of the match data. Some string that identifies the source of the data.
    pub(super) provider: String,
    /// If you want to update an existing match, you can provide an update id.
    pub(super) update_id: Option<Uuid>,
    /// Valve's match id of the match.
    pub(super) match_id: Option<i64>,
    /// The name of the first team.
    pub(super) team0_name: Option<String>,
    /// The name of the second team.
    pub(super) team1_name: Option<String>,
    /// The name of the tournament.
    pub(super) tournament_name: Option<String>,
    /// The stage of the tournament.
    pub(super) tournament_stage: Option<String>,
    /// The scheduled date of the match.
    pub(super) scheduled_date: Option<DateTime<Utc>>,
    /// The status of the match, e.g. live, completed, scheduled, cancelled.
    pub(super) status: Option<ESportsMatchStatus>,
}
