use crate::context::AppState;
use utoipa_axum::router::OpenApiRouter;

pub mod analytics;
pub mod builds;
mod commands;
mod esports;
pub mod info;
mod leaderboard;
mod matches;
mod patches;
pub mod players;
pub mod sql;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/matches", matches::router())
        .nest("/players", players::router())
        .nest("/leaderboard", leaderboard::router())
        .nest("/analytics", analytics::router())
        .nest("/builds", builds::router())
        .nest("/patches", patches::router())
        .nest("/commands", commands::router())
        .nest("/info", info::router())
        .nest("/esports", esports::router())
        .nest("/sql", sql::router())
}
