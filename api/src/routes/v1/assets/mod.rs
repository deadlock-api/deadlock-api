use core::time::Duration;

use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

mod accolades;
mod build_tags;
mod client_versions;
mod colors;
mod common;
mod heroes;
mod loot_tables;
mod misc_entities;
mod npc_units;
mod ranks;
mod steam_info;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/accolades", accolades::router())
        .nest("/build-tags", build_tags::router())
        .nest("/client-versions", client_versions::router())
        .nest("/colors", colors::router())
        .nest("/heroes", heroes::router())
        .nest("/loot-tables", loot_tables::router())
        .nest("/misc-entities", misc_entities::router())
        .nest("/npc-units", npc_units::router())
        .nest("/ranks", ranks::router())
        .nest("/steam-info", steam_info::router())
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(1))
                .with_stale_while_revalidate(Duration::from_hours(24))
                .with_stale_if_error(Duration::from_hours(24)),
        )
}
