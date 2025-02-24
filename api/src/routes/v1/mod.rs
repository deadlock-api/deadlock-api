use crate::state::AppState;
use utoipa_axum::router::OpenApiRouter;

mod info;
mod patches;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/patches", patches::router())
        .nest("/info", info::router())
}
