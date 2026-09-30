use axum::Json;
use axum::extract::Query;
use axum::http::header;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::error::{APIError, APIResult};
use crate::services::crosshair::{self, DEFAULT_SCREEN_HEIGHT, Settings};

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub(super) struct CodeQuery {
    /// Crosshair share code, as copied from the game's crosshair settings (`DL.…`).
    code: String,
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub(super) struct ScreenQuery {
    /// Height of the screen to render for, in pixels. Crosshair sizes scale with it.
    #[serde(default = "default_screen_height")]
    #[param(default = 1080, minimum = 480, maximum = 4320)]
    screen_height: u32,
}

fn default_screen_height() -> u32 {
    DEFAULT_SCREEN_HEIGHT
}

#[derive(Debug, Serialize, ToSchema)]
pub(super) struct CrosshairCode {
    /// Crosshair share code that can be imported in the game's crosshair settings.
    code: String,
}

async fn render_png(settings: Settings, screen: ScreenQuery) -> APIResult<impl IntoResponse> {
    // Large crosshairs take a few milliseconds to rasterise, so keep them off the async workers.
    let png =
        tokio::task::spawn_blocking(move || crosshair::render_png(&settings, screen.screen_height))
            .await
            .map_err(|e| APIError::internal(format!("Crosshair render task failed: {e}")))??;
    Ok(([(header::CONTENT_TYPE, "image/png")], png))
}

#[utoipa::path(
    get,
    path = "/code/image",
    params(CodeQuery, ScreenQuery),
    responses(
        (status = OK, description = "Crosshair image with a transparent background", content_type = "image/png", body = [u8]),
        (status = BAD_REQUEST, description = "Invalid crosshair code or screen height, or the crosshair is too large to render"),
    ),
    tags = ["Crosshair"],
    summary = "Crosshair Code Image",
    description = "Renders a crosshair share code as a PNG, pixel for pixel as the game draws it at the given screen height. The image is square, centred on the crosshair and has a transparent background."
)]
pub(super) async fn code_image(
    Query(CodeQuery { code }): Query<CodeQuery>,
    Query(screen): Query<ScreenQuery>,
) -> APIResult<impl IntoResponse> {
    render_png(crosshair::decode(&code)?, screen).await
}

#[utoipa::path(
    get,
    path = "/settings/code",
    params(Settings),
    responses(
        (status = OK, body = CrosshairCode),
        (status = BAD_REQUEST, description = "Invalid settings"),
    ),
    tags = ["Crosshair"],
    summary = "Crosshair Settings Code",
    description = "Encodes crosshair settings into a share code that can be imported in the game. Settings that are not given keep the game's defaults."
)]
pub(super) async fn settings_code(Query(settings): Query<Settings>) -> Json<CrosshairCode> {
    Json(CrosshairCode {
        code: crosshair::encode(&settings),
    })
}

#[utoipa::path(
    get,
    path = "/settings/image",
    params(Settings, ScreenQuery),
    responses(
        (status = OK, description = "Crosshair image with a transparent background", content_type = "image/png", body = [u8]),
        (status = BAD_REQUEST, description = "Invalid settings or screen height, or the crosshair is too large to render"),
    ),
    tags = ["Crosshair"],
    summary = "Crosshair Settings Image",
    description = "Renders crosshair settings as a PNG, pixel for pixel as the game draws them at the given screen height. Settings that are not given keep the game's defaults. The image is square, centred on the crosshair and has a transparent background."
)]
pub(super) async fn settings_image(
    Query(settings): Query<Settings>,
    Query(screen): Query<ScreenQuery>,
) -> APIResult<impl IntoResponse> {
    render_png(settings, screen).await
}
