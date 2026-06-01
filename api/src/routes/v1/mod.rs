use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;
use crate::middleware::cors;

pub mod analytics;
mod assets;
mod auth;
pub mod builds;
mod commands;
pub(crate) mod data_privacy;
mod graphql;
pub mod info;
mod leaderboard;
pub mod matches;
mod patches;
mod patron;
pub mod players;
pub(crate) mod servers;
pub mod sql;

pub(super) fn router(state: &AppState) -> OpenApiRouter<AppState> {
    let credentialed = OpenApiRouter::new()
        .nest("/auth", auth::router())
        .nest("/patron", patron::router())
        .layer(cors::credentialed());

    OpenApiRouter::new()
        .nest("/matches", matches::router())
        .nest("/players", players::router())
        .nest("/leaderboard", leaderboard::router())
        .nest("/analytics", analytics::router(state))
        .nest("/builds", builds::router())
        .nest("/patches", patches::router())
        .nest("/commands", commands::router())
        .nest("/info", info::router())
        .nest("/sql", sql::router())
        .nest("/servers", servers::router())
        .nest("/assets", assets::router())
        .merge(graphql::router())
        .layer(cors::public())
        .merge(credentialed)
}
