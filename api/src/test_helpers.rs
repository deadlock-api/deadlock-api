//! Internal helpers used by integration tests under `tests/`.
//!
//! The module is `pub` so the test binary (a separate crate) can call into
//! the heroes pipeline without us having to leak the full `HeroV2` type tree.
//! `#[doc(hidden)]` on the module declaration keeps it out of rustdoc and
//! signals that nothing here is part of the public API.

use std::collections::HashMap;

/// Build the `/v1/assets/heroes` JSON payload from raw source strings.
///
/// Convenience wrapper around the heroes pipeline that returns the same
/// `Vec<Value>` the public endpoint serves, so snapshot tests don't need
/// access to the private `HeroV2` types.
#[allow(clippy::implicit_hasher)]
pub fn build_heroes_json(
    heroes_vdata: &str,
    localization: &HashMap<String, String>,
    style_css: &str,
    bg_css: &str,
    only_active: bool,
) -> Result<Vec<serde_json::Value>, String> {
    let heroes = crate::services::assets::versions::heroes::build_heroes(
        heroes_vdata,
        localization,
        style_css,
        bg_css,
        only_active,
    )
    .map_err(|e| e.to_string())?;
    heroes
        .into_iter()
        .map(|h| serde_json::to_value(h).map_err(|e| e.to_string()))
        .collect()
}
