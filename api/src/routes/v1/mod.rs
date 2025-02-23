use crate::state::AppState;
use utoipa_axum::router::OpenApiRouter;

mod info;
mod patches;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/info", info::router())
        .nest("/patches", patches::router())
}
