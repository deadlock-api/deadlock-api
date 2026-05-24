//! `/v1/assets/colors` data layer.

use core::time::Duration;
use std::collections::BTreeMap;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;

use crate::services::assets::versions::common::Color;
use crate::services::assets::versions::css;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

const CSS_PATH: &str = "styles/citadel_base_styles.css";

pub(crate) fn build_colors(css_src: &str) -> BTreeMap<String, Color> {
    css::parse_define_colors(css_src)
}

const CACHE_SIZE: usize = 64;
const CACHE_TTL: Duration = Duration::from_hours(24);

#[cached(
    ty = "LruTtlCache<u32, Arc<BTreeMap<String, Color>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ version }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_colors(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<BTreeMap<String, Color>>, AssetsError> {
    let css_src = store::fetch_text(r2, version, CSS_PATH).await?;
    Ok(Arc::new(build_colors(&css_src)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("colors_fixtures/citadel_base_styles.css");

    #[test]
    fn snapshot_colors() {
        let colors = build_colors(FIXTURE);
        insta::with_settings!(
            { snapshot_path => "colors_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("colors", colors); }
        );
    }

    #[test]
    fn parses_six_and_eight_digit_hex() {
        let css = "@define baseText: #FFEFD7;\n\
                   @define baseBorder: #444444ff;\n\
                   @define fontList: Retail Demo, Noto Sans;\n\
                   @define colorRgb: rgb(243, 240, 231);\n";
        let colors = build_colors(css);
        assert_eq!(
            colors.get("base_text"),
            Some(&Color {
                red: 0xFF,
                green: 0xEF,
                blue: 0xD7,
                alpha: 0xFF
            })
        );
        assert_eq!(
            colors.get("base_border"),
            Some(&Color {
                red: 0x44,
                green: 0x44,
                blue: 0x44,
                alpha: 0xFF
            })
        );
        assert!(!colors.contains_key("font_list"));
        assert!(!colors.contains_key("color_rgb"));
    }
}
