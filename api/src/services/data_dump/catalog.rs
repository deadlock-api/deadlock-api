//! Builds the `DuckLake` catalog readers attach with
//! `ATTACH 'ducklake:https://data.deadlock-api.com/v1/catalog.ducklake' (READ_ONLY)`.
//!
//! `DuckLake` refuses an `https://` `DATA_PATH` (it wants to create the directory), so the
//! catalog is created with a dummy local data path and every file is registered by an absolute
//! path. Readers then need nothing but `httpfs`.
//!
//! Registering a file reads its parquet footer. Through the public domain, a footer of a file
//! the edge has not cached waits for Cloudflare to pull the whole object from R2 first (~10 s
//! per ~380 MB base file), which made the build take 10–70 minutes. So the footers are read
//! from R2's S3 API instead, all at once up front, into a staging catalog whose `s3://` paths
//! are then rewritten to the public URLs and copied into the published file.

use std::path::{Path, PathBuf};

use duckdb::{Config, Connection, params};
use tracing::warn;

use super::DumpError;
use super::manifest::{FileKind, Manifest, PolicyKind, TableState, TableStatus};

fn sql_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn sql_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// The lake bucket's S3 API, where the build reads parquet footers.
#[derive(Clone)]
pub(crate) struct FooterSource {
    /// `https://<account>.r2.cloudflarestorage.com`, or an override such as a local `http://`
    /// endpoint.
    pub(crate) endpoint: String,
    pub(crate) bucket: String,
    pub(crate) access_key_id: String,
    pub(crate) secret_access_key: String,
}

impl FooterSource {
    fn prefix(&self) -> String {
        format!("s3://{}/", self.bucket)
    }

    fn path(&self, key: &str) -> String {
        format!("{}{key}", self.prefix())
    }

    /// A temporary (in-memory) secret, so the credentials never reach the catalog file.
    fn create_secret_sql(&self) -> String {
        let (use_ssl, host) = self.endpoint.strip_prefix("https://").map_or_else(
            || {
                let host = self.endpoint.strip_prefix("http://");
                (false, host.unwrap_or(&self.endpoint))
            },
            |host| (true, host),
        );
        format!(
            "CREATE SECRET lake_footers (TYPE s3, KEY_ID {}, SECRET {}, ENDPOINT {}, \
             REGION 'auto', URL_STYLE 'path', USE_SSL {use_ssl}, SCOPE {});",
            sql_str(&self.access_key_id),
            sql_str(&self.secret_access_key),
            sql_str(host.trim_end_matches('/')),
            sql_str(&self.prefix()),
        )
    }
}

pub(crate) struct BuiltCatalog {
    pub(crate) path: PathBuf,
    pub(crate) duckdb_version: String,
}

/// Writes the catalog for every ready table into `dir` and returns its path. Blocking.
pub(crate) fn build(
    dir: &Path,
    manifest: &Manifest,
    source: &FooterSource,
) -> Result<BuiltCatalog, DumpError> {
    std::fs::create_dir_all(dir)?;
    let staging_path = dir.join("staging.ducklake");
    let catalog_path = dir.join("catalog.ducklake");
    let data_path = dir.join("data");
    let config = Config::default()
        .with(
            "extension_directory",
            dir.join("extensions").to_string_lossy(),
        )?
        .with("temp_directory", dir.join("tmp").to_string_lossy())?;
    let conn = Connection::open_in_memory_with_flags(config)?;
    // The prefetch fills the external file cache (footers) and the HTTP metadata cache (HEAD),
    // so registering a file needs no request.
    conn.execute_batch(
        "INSTALL ducklake; INSTALL httpfs; LOAD ducklake; LOAD httpfs;
         SET http_retries = 5; SET http_retry_wait_ms = 500;
         SET enable_external_file_cache = true; SET enable_http_metadata_cache = true;",
    )?;
    conn.execute_batch(&source.create_secret_sql())?;
    let duckdb_version: String = conn.query_row("SELECT version()", [], |row| row.get(0))?;
    conn.execute_batch(&format!(
        "ATTACH 'ducklake:{}' AS lake (DATA_PATH {});",
        staging_path.to_string_lossy().replace('\'', "''"),
        sql_str(&format!("{}/", data_path.to_string_lossy()))
    ))?;

    let ready = manifest
        .tables
        .iter()
        .filter(|(_, t)| t.status == TableStatus::Ready)
        .collect::<Vec<_>>();
    prefetch_footers(&conn, &ready, source);
    for (name, table) in ready {
        register_table(&conn, name, table, source)?;
    }
    conn.execute_batch("DETACH lake;")?;
    conn.close().map_err(|(_, e)| e)?;

    publish(
        &staging_path,
        &catalog_path,
        &source.prefix(),
        &format!("{}/", manifest.public_url),
    )?;
    Ok(BuiltCatalog {
        path: catalog_path,
        duckdb_version,
    })
}

/// One multi-threaded read of every footer (~25 s for ~900 files) instead of one round trip
/// per file while registering. Best effort: without it, registering reads each footer itself.
fn prefetch_footers(conn: &Connection, tables: &[(&String, &TableState)], source: &FooterSource) {
    let paths = tables
        .iter()
        .flat_map(|(_, t)| t.published_files())
        .map(|f| sql_str(&source.path(&f.key)))
        .collect::<Vec<_>>();
    if !paths.is_empty()
        && let Err(e) = conn.execute_batch(&format!(
            "SELECT count(*) FROM parquet_file_metadata([{}]);",
            paths.join(",")
        ))
    {
        warn!("data dump: catalog footer prefetch failed, registering files one by one: {e}");
    }
}

/// Creates `name` in the attached `lake` with all its published files, column comments and,
/// for incremental tables with deltas, the `<name>_latest` view.
fn register_table(
    conn: &Connection,
    name: &str,
    table: &TableState,
    source: &FooterSource,
) -> Result<(), DumpError> {
    let mut files = table.published_files();
    // Newest file first: with additive schema changes it carries the complete column set.
    files.sort_by_key(|f| core::cmp::Reverse(f.built_at));
    let Some(newest) = files.first() else {
        return Ok(());
    };
    let ident = sql_ident(name);
    // One snapshot per table instead of one per file: per-file commits cost ~70 ms each at
    // ~900 files.
    conn.execute_batch("BEGIN;")?;
    conn.execute_batch(&format!(
        "CREATE TABLE lake.{ident} AS SELECT * FROM read_parquet({}) WHERE 1 = 0;",
        sql_str(&source.path(&newest.key))
    ))?;
    for file in &files {
        conn.execute_batch(&format!(
            "CALL ducklake_add_data_files('lake', {}, {}, allow_missing => true);",
            sql_str(name),
            sql_str(&source.path(&file.key))
        ))?;
    }
    conn.execute_batch("COMMIT;")?;
    // Outside the transaction: a failed statement would abort it.
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
    Ok(())
}

/// Writes the staging catalog to `catalog_path` with every file at its public URL.
fn publish(
    staging_path: &Path,
    catalog_path: &Path,
    s3_prefix: &str,
    public_prefix: &str,
) -> Result<(), DumpError> {
    let meta = Connection::open_in_memory()?;
    meta.execute_batch(&format!(
        "ATTACH {} AS staging; ATTACH {} AS published; USE staging;",
        sql_str(&staging_path.to_string_lossy()),
        sql_str(&catalog_path.to_string_lossy()),
    ))?;
    publish_paths(&meta, s3_prefix, public_prefix)?;
    // A fresh file: the UPDATE leaves the old `s3://` values behind in dead blocks (~3 MB).
    // The checkpoint folds the write-ahead log into it so readers get a single object.
    meta.execute_batch(
        "COPY FROM DATABASE staging TO published; CHECKPOINT published;
         USE memory; DETACH published; DETACH staging;",
    )?;
    meta.close().map_err(|(_, e)| e)?;
    let wal = catalog_path.with_extension("ducklake.wal");
    if let Err(e) = std::fs::remove_file(&wal)
        && e.kind() != std::io::ErrorKind::NotFound
    {
        warn!("data dump: failed to remove {wal:?}: {e}");
    }
    Ok(())
}

/// Points every registered file at its public URL instead of the S3 path it was read from.
/// Fails if any path is left that readers could not open.
fn publish_paths(meta: &Connection, s3_prefix: &str, public_prefix: &str) -> Result<(), DumpError> {
    // `substr` is 1-based.
    let rest_from = i64::try_from(s3_prefix.chars().count())
        .unwrap_or(i64::MAX)
        .saturating_add(1);
    meta.execute(
        "UPDATE ducklake_data_file SET path = ? || substr(path, ?) WHERE starts_with(path, ?)",
        params![public_prefix, rest_from, s3_prefix],
    )?;
    let unpublished: i64 = meta.query_row(
        "SELECT count(*) FROM ducklake_data_file WHERE NOT starts_with(path, ?)",
        [public_prefix],
        |row| row.get(0),
    )?;
    if unpublished == 0 {
        Ok(())
    } else {
        Err(DumpError::CatalogPaths(unpublished))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(endpoint: &str) -> FooterSource {
        FooterSource {
            endpoint: endpoint.to_owned(),
            bucket: "lake".to_owned(),
            access_key_id: "id".to_owned(),
            secret_access_key: "se'cret".to_owned(),
        }
    }

    #[test]
    fn secret_follows_the_endpoint_scheme() {
        let sql = source("https://acct.r2.cloudflarestorage.com/").create_secret_sql();
        assert!(
            sql.contains("ENDPOINT 'acct.r2.cloudflarestorage.com'"),
            "{sql}"
        );
        assert!(sql.contains("USE_SSL true"), "{sql}");
        assert!(sql.contains("SECRET 'se''cret'"), "{sql}");
        assert!(sql.contains("SCOPE 's3://lake/'"), "{sql}");
        let sql = source("http://localhost:9000").create_secret_sql();
        assert!(sql.contains("ENDPOINT 'localhost:9000'"), "{sql}");
        assert!(sql.contains("USE_SSL false"), "{sql}");
    }

    fn data_files(paths: &[&str]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE ducklake_data_file (path VARCHAR);")
            .unwrap();
        for path in paths {
            conn.execute("INSERT INTO ducklake_data_file VALUES (?)", [path])
                .unwrap();
        }
        conn
    }

    #[test]
    fn publish_paths_rewrites_the_s3_prefix() {
        let conn = data_files(&[
            "s3://lake/v1/tables/a/x.parquet",
            "s3://lake/v1/tables/b/y.parquet",
        ]);
        publish_paths(&conn, "s3://lake/", "https://data.example.com/").unwrap();
        let mut stmt = conn
            .prepare("SELECT path FROM ducklake_data_file ORDER BY path")
            .unwrap();
        let paths = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            paths,
            [
                "https://data.example.com/v1/tables/a/x.parquet",
                "https://data.example.com/v1/tables/b/y.parquet",
            ]
        );
    }

    #[test]
    fn publish_paths_fails_on_a_foreign_path() {
        let conn = data_files(&["s3://lake/v1/a.parquet", "s3://other/v1/b.parquet"]);
        let err = publish_paths(&conn, "s3://lake/", "https://data.example.com/").unwrap_err();
        assert!(matches!(err, DumpError::CatalogPaths(1)), "{err}");
    }
}
