//! `/v1/assets/items` data layer: fetch source files from R2, parse,
//! transform, and cache the public item list. SVG icons are fetched from
//! the public asset bucket (see `svg`).

#![allow(
    clippy::too_many_lines,
    clippy::too_many_arguments,
    clippy::case_sensitive_file_extension_comparisons,
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::cast_lossless,
    clippy::large_enum_variant,
    clippy::module_name_repetitions,
    clippy::similar_names,
    clippy::if_not_else
)]

use core::time::Duration;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;

use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;
use crate::services::assets::versions::store;

mod build;
mod css_lookup;
mod detect;
mod generic_data;
mod paths;
pub(crate) mod raw;
mod svg;
mod template;
pub(crate) mod types;

pub(crate) use types::Item;

const CACHE_SIZE: usize = 32;
const CACHE_TTL: Duration = Duration::from_hours(24);

#[cached(
    ty = "LruTtlCache<(u32, String), Arc<Vec<Item>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_items(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<Item>>, AssetsError> {
    let text = |rel: &'static str| async move {
        store::fetch_text(r2, version, rel)
            .await
            .map_err(AssetsError::from)
    };
    let (abilities, heroes, generic, loc, icons_css, prop_icons_css, base_styles_css) = tokio::try_join!(
        text("scripts/abilities.vdata"),
        text("scripts/heroes.vdata"),
        text("scripts/generic_data.vdata"),
        localization::fetch_localization(r2, version, language),
        text("styles/ability_icons.css"),
        text("styles/ability_property_icons.css"),
        text("styles/citadel_base_styles.css"),
    )?;

    let items = build::build_items(build::BuildInputs {
        abilities_vdata: &abilities,
        heroes_vdata: &heroes,
        generic_data_vdata: &generic,
        localization: &loc,
        ability_icons_css: &icons_css,
        ability_property_icons_css: &prop_icons_css,
        citadel_base_styles_css: &base_styles_css,
    })
    .await?;

    Ok(Arc::new(items))
}
