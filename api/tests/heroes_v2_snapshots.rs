//! Snapshot tests for the `/v1/assets/heroes` pipeline.
//!
//! Fetches the per-version source files from the public R2 mirror (no
//! credentials required), decompresses them, runs the heroes build via
//! [`deadlock_api_rust::test_helpers::build_heroes_json`], and snapshots the
//! resulting JSON with `insta`. Source files are cached under
//! `target/test_fixtures/` so reruns are offline-friendly.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;

use deadlock_api_rust::test_helpers::build_heroes_json;

const PUBLIC_BUCKET: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/versions";
const TEST_VERSION: u32 = 6514;

fn fixture_dir() -> PathBuf {
    let base = std::env::var_os("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target"));
    base.join("test_fixtures")
        .join("heroes_v2")
        .join(TEST_VERSION.to_string())
}

fn rt() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("rt")
    })
}

fn http() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("client")
    })
}

/// Fetch `<rel_path>.zst` from the public CDN, decompress, and cache to disk.
fn fetch_cached_text(rel_path: &str) -> String {
    let cache = fixture_dir().join(rel_path);
    if let Ok(s) = std::fs::read_to_string(&cache) {
        return s;
    }
    let url = format!("{PUBLIC_BUCKET}/{TEST_VERSION}/{rel_path}.zst");
    let bytes = rt().block_on(async {
        http()
            .get(&url)
            .send()
            .await
            .expect("send")
            .error_for_status()
            .unwrap_or_else(|e| panic!("fetch {url}: {e}"))
            .bytes()
            .await
            .expect("bytes")
    });
    let decoded = rt().block_on(async {
        use async_compression::tokio::bufread::ZstdDecoder;
        use tokio::io::AsyncReadExt;
        let mut dec = ZstdDecoder::new(bytes.as_ref());
        let mut out = Vec::with_capacity(bytes.len() * 4);
        dec.read_to_end(&mut out).await.expect("decode");
        out
    });
    let text = String::from_utf8(decoded).expect("utf8");
    if let Some(parent) = cache.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&cache, &text);
    text
}

fn load_built_heroes(language: &str) -> Vec<serde_json::Value> {
    let heroes_vdata = fetch_cached_text("scripts/heroes.vdata");
    let style_css = fetch_cached_text("styles/citadel_base_styles.css");
    let bg_css = fetch_cached_text("styles/hero_background_default.css");
    let lang_json = fetch_cached_text(&format!("localization/{language}.json"));
    let localization: HashMap<String, String> =
        serde_json::from_str(&lang_json).expect("localization");
    build_heroes_json(&heroes_vdata, &localization, &style_css, &bg_css, false)
        .expect("build heroes")
}

#[test]
fn snapshot_english() {
    let heroes = load_built_heroes("english");
    insta::with_settings!(
        { snapshot_path => "heroes_snapshots", prepend_module_to_snapshot => false },
        { insta::assert_json_snapshot!("heroes_english_v6514", heroes); }
    );
}

#[test]
fn snapshot_german() {
    let heroes = load_built_heroes("german");
    insta::with_settings!(
        { snapshot_path => "heroes_snapshots", prepend_module_to_snapshot => false },
        { insta::assert_json_snapshot!("heroes_german_v6514", heroes); }
    );
}
