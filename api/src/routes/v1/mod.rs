use crate::state::AppState;
use utoipa_axum::router::OpenApiRouter;

mod builds;
mod info;
mod matches;
mod patches;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/matches", matches::router())
        .nest("/builds", builds::router())
        .nest("/patches", patches::router())
        .nest("/info", info::router())
}
