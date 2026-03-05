use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;

pub mod analytics;
mod auth;
pub mod builds;
mod commands;
pub(crate) mod data_privacy;
pub mod info;
mod leaderboard;
pub mod matches;
mod patches;
mod patron;
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
        .nest("/sql", sql::router())
        .nest("/auth", auth::router())
        .nest("/patron", patron::router())
}
