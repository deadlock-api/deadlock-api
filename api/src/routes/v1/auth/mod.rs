use axum::routing::{get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;

mod patreon;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .route("/patreon", get(patreon::login))
        .route("/patreon/callback", get(patreon::callback))
        .route("/patreon/logout", post(patreon::logout))
}
