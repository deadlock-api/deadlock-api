//! Builds the `DuckLake` catalog readers attach with
//! `ATTACH 'ducklake:https://data.deadlock-api.com/v1/catalog.ducklake' (READ_ONLY)`.
//!
//! `DuckLake` refuses an `https://` `DATA_PATH` (it wants to create the directory), so the
//! catalog is created with a dummy local data path and every file is registered by its
//! absolute public URL. Readers then need nothing but `httpfs`.

use std::path::{Path, PathBuf};

use duckdb::{Config, Connection};
use tracing::warn;

use super::DumpError;
use super::manifest::{FileKind, Manifest, PolicyKind, TableStatus};

fn sql_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn sql_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

pub(crate) struct BuiltCatalog {
    pub(crate) path: PathBuf,
    pub(crate) duckdb_version: String,
}

/// Writes the catalog for every ready table into `dir` and returns its path. Blocking.
pub(crate) fn build(dir: &Path, manifest: &Manifest) -> Result<BuiltCatalog, DumpError> {
    std::fs::create_dir_all(dir)?;
    let catalog_path = dir.join("catalog.ducklake");
    let data_path = dir.join("data");
    let config = Config::default()
        .with(
            "extension_directory",
            dir.join("extensions").to_string_lossy(),
        )?
        .with("temp_directory", dir.join("tmp").to_string_lossy())?;
    let conn = Connection::open_in_memory_with_flags(config)?;
    conn.execute_batch(
        "INSTALL ducklake; INSTALL httpfs; LOAD ducklake; LOAD httpfs;
         SET http_retries = 5; SET http_retry_wait_ms = 500;",
    )?;
    let duckdb_version: String = conn.query_row("SELECT version()", [], |row| row.get(0))?;
    conn.execute_batch(&format!(
        "ATTACH 'ducklake:{}' AS lake (DATA_PATH {});",
        catalog_path.to_string_lossy().replace('\'', "''"),
        sql_str(&format!("{}/", data_path.to_string_lossy()))
    ))?;

    for (name, table) in &manifest.tables {
        if table.status != TableStatus::Ready {
            continue;
        }
        let mut files = table.published_files();
        if files.is_empty() {
            continue;
        }
        // Newest file first: with additive schema changes it carries the complete column set.
        files.sort_by_key(|f| core::cmp::Reverse(f.built_at));
        let ident = sql_ident(name);
        conn.execute_batch(&format!(
            "CREATE TABLE lake.{ident} AS SELECT * FROM read_parquet({}) WHERE 1 = 0;",
            sql_str(&manifest.url(&files[0].key))
        ))?;
        for file in &files {
            conn.execute_batch(&format!(
                "CALL ducklake_add_data_files('lake', {}, {}, allow_missing => true);",
                sql_str(name),
                sql_str(&manifest.url(&file.key))
            ))?;
        }
        for column in table.columns.iter().filter(|c| c.comment.is_some()) {
            let sql = format!(
                "COMMENT ON COLUMN lake.{ident}.{} IS {};",
                sql_ident(&column.name),
                sql_str(column.comment.as_deref().unwrap_or_default())
            );
            if let Err(e) = conn.execute_batch(&sql) {
                warn!(
                    "data dump: could not comment column {name}.{}: {e}",
                    column.name
                );
            }
        }
        if table.policy == PolicyKind::Incremental
            && let Some(watermark) = &table.watermark
            && files.iter().any(|f| f.kind != FileKind::Base)
        {
            // Delta files can carry a newer version of a row already in a base file; this view
            // resolves them the way ClickHouse's FINAL does. `start_time` is constant per
            // (match_id, account_id); listing it in the partition key lets DuckDB push
            // filters on it through the window instead of scanning the whole table.
            let view = format!(
                "CREATE VIEW lake.{} AS SELECT * FROM lake.{ident} \
                 QUALIFY row_number() OVER (PARTITION BY match_id, account_id, start_time ORDER BY {} DESC) = 1;",
                sql_ident(&format!("{name}_latest")),
                sql_ident(watermark)
            );
            if let Err(e) = conn.execute_batch(&view) {
                warn!("data dump: could not create {name}_latest view in the catalog: {e}");
            }
        }
    }
    conn.execute_batch("DETACH lake;")?;
    conn.close().map_err(|(_, e)| e)?;

    // Fold the write-ahead log into the metadata file so readers get a single object.
    let meta = Connection::open(&catalog_path)?;
    meta.execute_batch("CHECKPOINT;")?;
    meta.close().map_err(|(_, e)| e)?;
    let _ = std::fs::remove_file(dir.join("catalog.ducklake.wal"));

    Ok(BuiltCatalog {
        path: catalog_path,
        duckdb_version,
    })
}
