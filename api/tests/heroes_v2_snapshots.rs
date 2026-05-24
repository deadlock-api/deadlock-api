//! Snapshot tests for the `/v1/assets/heroes` pipeline.
//!
//! Reads per-version source fixtures committed under `tests/fixtures/`, runs
//! the heroes build via [`deadlock_api_rust::test_helpers::build_heroes_json`],
//! and snapshots the resulting JSON with `insta`. Fully hermetic — no network
//! access required.

use std::collections::HashMap;
use std::path::PathBuf;

use deadlock_api_rust::test_helpers::build_heroes_json;

const TEST_VERSION: u32 = 6514;

fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("heroes_v2")
        .join(TEST_VERSION.to_string())
}

fn read_fixture(rel_path: &str) -> String {
    let path = fixture_dir().join(rel_path);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()))
}

fn load_built_heroes(language: &str) -> Vec<serde_json::Value> {
    let heroes_vdata = read_fixture("scripts/heroes.vdata");
    let style_css = read_fixture("styles/citadel_base_styles.css");
    let bg_css = read_fixture("styles/hero_background_default.css");
    let lang_json = read_fixture(&format!("localization/{language}.json"));
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
