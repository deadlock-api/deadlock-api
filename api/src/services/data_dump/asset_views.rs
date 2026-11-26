//! Views over the API's `/v1/assets` endpoints in the published catalog, in its `assets`
//! schema (`SELECT * FROM lake.assets.heroes`). They read the endpoint live on every query (the
//! reader's `DuckDB` fetches the JSON over `httpfs`), so they always match the current patch.
//!
//! Each view picks the main keys of its endpoint with explicit `read_json` columns: no schema
//! inference over the nested parts, and a fixed shape when the endpoint gains fields.
//!
//! The endpoints send no `Content-Length` and ignore `Range`. `read_text` and
//! `read_json_objects` then run out of memory on the larger ones (`images`, `sounds`) unless
//! the reader sets `force_download`; `read_json` streams them, so every view goes through it.

use duckdb::Connection;
use tracing::warn;

use super::DumpError;

/// Where the views read from; the edge caches every endpoint for an hour.
const ASSETS_URL: &str = "https://api.deadlock-api.com/v1/assets";

/// Schema of the catalog the views live in.
const SCHEMA: &str = "assets";

/// How a view gets its rows out of an endpoint's JSON.
#[derive(Debug, Clone, Copy)]
enum Shape {
    /// An array of objects, one row each: `read_json` `columns` (a struct literal body).
    Rows(&'static str),
    /// An object keyed by name: `name` plus the select list over each value `e.value` (JSON).
    Map(&'static str),
    /// A nested listing of files: one `(path, url)` row per URL in it.
    Files,
    /// An array of client versions.
    Versions,
}

struct AssetView {
    name: &'static str,
    /// Path under [`ASSETS_URL`].
    endpoint: &'static str,
    shape: Shape,
    comment: &'static str,
}

const VIEWS: &[AssetView] = &[
    AssetView {
        name: "heroes",
        endpoint: "heroes",
        shape: Shape::Rows(
            "id: 'UINTEGER', class_name: 'VARCHAR', name: 'VARCHAR', hero_type: 'VARCHAR', \
             complexity: 'UTINYINT', gender: 'VARCHAR', gun_tag: 'VARCHAR', \
             player_selectable: 'BOOLEAN', disabled: 'BOOLEAN', in_development: 'BOOLEAN', \
             needs_testing: 'BOOLEAN', limited_testing: 'BOOLEAN', prerelease_only: 'BOOLEAN', \
             assigned_players_only: 'BOOLEAN', development_state: 'VARCHAR'",
        ),
        comment: "Heroes (hero_id = id), live from /v1/assets/heroes. Only player_selectable and \
                  not disabled heroes are in matchmaking.",
    },
    AssetView {
        name: "items",
        endpoint: "items",
        shape: Shape::Rows(
            "id: 'UINTEGER', class_name: 'VARCHAR', name: 'VARCHAR', type: 'VARCHAR', \
             hero: 'UINTEGER', heroes: 'UINTEGER[]', ability_type: 'VARCHAR', \
             item_slot_type: 'VARCHAR', item_tier: 'UTINYINT', cost: 'UINTEGER', \
             activation: 'VARCHAR', is_active_item: 'BOOLEAN', shopable: 'BOOLEAN', \
             disabled: 'BOOLEAN', imbue: 'VARCHAR', component_items: 'VARCHAR[]', image: 'VARCHAR'",
        ),
        comment: "Abilities, weapons and shop upgrades (item_id = id), live from /v1/assets/items. \
                  type is ability, weapon or upgrade; hero is the hero an ability or weapon belongs \
                  to; item_tier, cost and item_slot_type are set on upgrades.",
    },
    AssetView {
        name: "ranks",
        endpoint: "ranks",
        shape: Shape::Rows("tier: 'UTINYINT', name: 'VARCHAR', color: 'VARCHAR'"),
        comment: "Rank tiers, live from /v1/assets/ranks. A badge is tier * 10 + subrank \
                  (subrank 1-6).",
    },
    AssetView {
        name: "ranked_seasons",
        endpoint: "ranked-seasons",
        shape: Shape::Rows(
            "class_name: 'VARCHAR', name: 'VARCHAR', ranked_type: 'VARCHAR', min_wins: 'UINTEGER', \
             min_hero_wins: 'UINTEGER', min_hero_unlocks: 'UINTEGER', \
             calibration_matches: 'UINTEGER', calibration_max_rank: 'UTINYINT', \
             valid_party_sizes: 'UTINYINT[]', intervals: 'STRUCT(\"interval\" UINTEGER, \
             start_timestamp BIGINT, end_timestamp BIGINT, leaderboard_id UINTEGER)[]'",
        ),
        comment: "Ranked seasons, live from /v1/assets/ranked-seasons. rank_interval in the \
                  match tables is an intervals[].interval; timestamps are unix seconds.",
    },
    AssetView {
        name: "accolades",
        endpoint: "accolades",
        shape: Shape::Rows(
            "id: 'UINTEGER', class_name: 'VARCHAR', tracked_stat_name: 'VARCHAR', \
             flavor_name: 'VARCHAR', description: 'VARCHAR', threshold_type: 'VARCHAR', \
             enabled_game_modes: 'VARCHAR[]'",
        ),
        comment: "End-of-match accolades, live from /v1/assets/accolades.",
    },
    AssetView {
        name: "build_tags",
        endpoint: "build-tags",
        shape: Shape::Rows(
            "id: 'UINTEGER', class_name: 'VARCHAR', label: 'VARCHAR', icon: 'VARCHAR'",
        ),
        comment: "Hero build tags, live from /v1/assets/build-tags.",
    },
    AssetView {
        name: "misc_entities",
        endpoint: "misc-entities",
        shape: Shape::Rows("id: 'UINTEGER', class_name: 'VARCHAR', name: 'VARCHAR'"),
        comment: "Map entities (power-ups, breakables, pickups), live from /v1/assets/misc-entities.",
    },
    AssetView {
        name: "modifiers",
        endpoint: "modifiers",
        shape: Shape::Rows(
            "id: 'UINTEGER', class_name: 'VARCHAR', class: 'VARCHAR', base: 'VARCHAR', \
             folder: 'VARCHAR'",
        ),
        comment: "Modifiers (buffs and debuffs), live from /v1/assets/modifiers.",
    },
    AssetView {
        name: "npc_units",
        endpoint: "npc-units",
        shape: Shape::Rows(
            "id: 'UINTEGER', class_name: 'VARCHAR', name: 'VARCHAR', max_health: 'DOUBLE', \
             gold_reward: 'DOUBLE', neutral_type: 'VARCHAR'",
        ),
        comment: "NPC units (troopers, neutrals, objectives), live from /v1/assets/npc-units.",
    },
    AssetView {
        name: "colors",
        endpoint: "colors",
        shape: Shape::Map(
            "(e.value ->> 'red')::UTINYINT AS red, (e.value ->> 'green')::UTINYINT AS green, \
             (e.value ->> 'blue')::UTINYINT AS blue, (e.value ->> 'alpha')::UTINYINT AS alpha",
        ),
        comment: "Named UI colors, live from /v1/assets/colors.",
    },
    AssetView {
        name: "convars",
        endpoint: "convars",
        shape: Shape::Map(
            "e.value ->> 'type' AS type, e.value ->> 'default' AS default_value, \
             (e.value ->> 'flags')::UBIGINT AS flags, e.value ->> 'description' AS description",
        ),
        comment: "Console variables with their defaults, live from /v1/assets/convars.",
    },
    AssetView {
        name: "client_versions",
        endpoint: "client-versions",
        shape: Shape::Versions,
        comment: "Client versions the asset endpoints have data for, live from \
                  /v1/assets/client-versions.",
    },
    AssetView {
        name: "steam_info",
        endpoint: "steam-info",
        shape: Shape::Rows(
            "client_version: 'UINTEGER', server_version: 'UINTEGER', product_name: 'VARCHAR', \
             app_id: 'UINTEGER', server_app_id: 'UINTEGER', source_revision: 'UBIGINT', \
             version_datetime: 'TIMESTAMP'",
        ),
        comment: "The current game build (one row), live from /v1/assets/steam-info.",
    },
    AssetView {
        name: "images",
        endpoint: "images",
        shape: Shape::Files,
        comment: "Image files on the asset CDN, live from /v1/assets/images.",
    },
    AssetView {
        name: "icons",
        endpoint: "icons",
        shape: Shape::Files,
        comment: "Icon files on the asset CDN, live from /v1/assets/icons.",
    },
    AssetView {
        name: "sounds",
        endpoint: "sounds",
        shape: Shape::Files,
        comment: "Sound files on the asset CDN, live from /v1/assets/sounds.",
    },
    AssetView {
        name: "fonts",
        endpoint: "fonts",
        shape: Shape::Files,
        comment: "Font files on the asset CDN, live from /v1/assets/fonts.",
    },
    AssetView {
        name: "models",
        endpoint: "models",
        shape: Shape::Files,
        comment: "3D model files on the asset CDN, live from /v1/assets/models.",
    },
];

fn sql_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn sql_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// The response as JSON values: the whole object, or one row per element of an array.
fn whole(url: &str) -> String {
    format!(
        "read_json({}, records = false, columns = {{json: 'JSON'}}, maximum_object_size = 268435456)",
        sql_str(url)
    )
}

fn select(view: &AssetView) -> String {
    let url = format!("{ASSETS_URL}/{}", view.endpoint);
    match view.shape {
        Shape::Rows(columns) => format!(
            "SELECT * FROM read_json({}, columns = {{{columns}}}, maximum_object_size = 268435456)",
            sql_str(&url)
        ),
        // The unnests sit in a select list: as a lateral join (`FROM j, json_each(j.json)`)
        // every output row carries the whole document, 133k x 18 MB for `sounds`.
        Shape::Map(values) => format!(
            "SELECT e.key AS name, {values} \
             FROM (SELECT unnest(map_entries(j.json::MAP(VARCHAR, JSON))) AS e FROM {} AS j)",
            whole(&url)
        ),
        Shape::Files => format!(
            "SELECT regexp_extract(url, 'assets-api-res/[^/]+/(.+)$', 1) AS path, url \
             FROM (SELECT unnest(regexp_extract_all(j.json::VARCHAR, '\"(https?://[^\"]+)\"', 1)) AS url \
             FROM {} AS j)",
            whole(&url)
        ),
        Shape::Versions => format!(
            "SELECT j.json::UINTEGER AS client_version FROM {} AS j",
            whole(&url)
        ),
    }
}

/// Creates the `assets` schema and its views in the attached `lake`. Creating a view binds it,
/// which fetches its endpoint once; a view whose endpoint fails is left out with a warning.
pub(crate) fn register(conn: &Connection) -> Result<(), DumpError> {
    conn.execute_batch(&format!(
        "CREATE SCHEMA IF NOT EXISTS lake.{};",
        sql_ident(SCHEMA)
    ))?;
    for view in VIEWS {
        let ident = format!("lake.{}.{}", sql_ident(SCHEMA), sql_ident(view.name));
        let sql = format!(
            "CREATE VIEW {ident} AS {}; COMMENT ON VIEW {ident} IS {};",
            select(view),
            sql_str(view.comment)
        );
        if let Err(e) = conn.execute_batch(&sql) {
            warn!("data dump: could not create the {ident} view in the catalog: {e}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_view_parses() {
        let conn = Connection::open_in_memory().unwrap();
        for view in VIEWS {
            let sql = select(view);
            let error: Option<String> = conn
                .query_row(
                    "SELECT json_extract_string(json_serialize_sql(?::VARCHAR), '$.error_message')",
                    [&sql],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(error, None, "{}: {sql}", view.name);
        }
    }

    /// Fetches every endpoint: `cargo test -p deadlock-api asset_views -- --ignored`.
    #[test]
    #[ignore = "reads the live asset endpoints"]
    fn every_view_reads_its_endpoint() {
        let dir = std::env::temp_dir().join(format!("asset-views-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let catalog = dir.join("c.ducklake");
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(&format!(
            "INSTALL ducklake; INSTALL httpfs; LOAD ducklake; LOAD httpfs;
             ATTACH 'ducklake:{}' AS lake (DATA_PATH '{}/data/');",
            catalog.display(),
            dir.display()
        ))
        .unwrap();
        register(&conn).unwrap();
        conn.execute_batch("DETACH lake;").unwrap();
        // A reader's view of the catalog: attached read-only, the views resolved from it.
        conn.execute_batch(&format!(
            "ATTACH 'ducklake:{}' AS lake (READ_ONLY);",
            catalog.display()
        ))
        .unwrap();
        for view in VIEWS {
            let rows: i64 = conn
                .query_row(
                    &format!("SELECT count(*) FROM lake.assets.{}", sql_ident(view.name)),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|e| panic!("{}: {e}", view.name));
            assert!(rows > 0, "{} is empty", view.name);
        }
        let (name, hero): (String, Option<u32>) = conn
            .query_row(
                "SELECT name, hero FROM lake.assets.items WHERE type = 'ability' AND hero IS NOT NULL LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(!name.is_empty() && hero.is_some());
        drop(conn);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn names_are_unique() {
        let mut names: Vec<_> = VIEWS.iter().map(|v| v.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), VIEWS.len());
    }
}
