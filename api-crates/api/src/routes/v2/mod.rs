use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;

mod patches;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().nest("/patches", patches::router())
}
