use crate::state::AppState;
use utoipa_axum::router::OpenApiRouter;

pub mod analytics;
pub mod builds;
pub mod commands;
pub mod info;
pub mod leaderboard;
pub mod matches;
pub mod patches;
pub mod players;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/matches", matches::router())
        .nest("/players", players::router())
        .nest("/leaderboard", leaderboard::router())
        .nest("/analytics", analytics::router())
        .nest("/builds", builds::router())
        .nest("/patches", patches::router())
        .nest("/commands", commands::router())
        .nest("/info", info::router())
}
