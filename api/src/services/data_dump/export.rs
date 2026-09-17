//! Runs one export statement and measures the object it produced.

use std::collections::BTreeMap;
use std::sync::Arc;

use clickhouse::Row;
use object_store::path::Path;
use object_store::{ObjectStore, ObjectStoreExt};
use serde::Deserialize;
use tracing::info;

use super::DumpError;
use super::sql::{self, LOG_COMMENT};

pub(crate) struct Exporter {
    pub(crate) ch: clickhouse::Client,
    pub(crate) store: Arc<dyn ObjectStore>,
    pub(crate) named_collection: String,
    pub(crate) run_id: String,
}

pub(crate) struct Exported {
    pub(crate) rows: u64,
    pub(crate) bytes: u64,
}

#[derive(Row, Deserialize)]
struct PartitionRow {
    p: u64,
    rows: u64,
}

impl Exporter {
    fn query(&self, sql: &str, step: &str) -> clickhouse::query::Query {
        self.ch
            .query(sql)
            .with_setting("query_id", format!("{}-{step}", self.run_id))
            .with_setting("log_comment", LOG_COMMENT)
    }

    pub(crate) async fn execute(&self, sql: &str, step: &str) -> Result<(), DumpError> {
        self.query(sql, step).execute().await?;
        Ok(())
    }

    pub(crate) async fn fetch_i64(&self, sql: &str, step: &str) -> Result<i64, DumpError> {
        Ok(self.query(sql, step).fetch_one::<i64>().await?)
    }

    pub(crate) async fn partition_counts(
        &self,
        sql: &str,
        step: &str,
    ) -> Result<BTreeMap<u64, u64>, DumpError> {
        Ok(self
            .query(sql, step)
            .fetch_all::<PartitionRow>()
            .await?
            .into_iter()
            .map(|r| (r.p, r.rows))
            .collect())
    }

    /// Runs an `INSERT INTO FUNCTION s3(...)` and returns the size of the object it wrote, or
    /// `None` when the statement selected no rows (the empty object, if any, is removed).
    pub(crate) async fn export(
        &self,
        sql: &str,
        key: &str,
        step: &str,
    ) -> Result<Option<Exported>, DumpError> {
        let started = std::time::Instant::now();
        self.execute(sql, step).await?;
        let path = Path::from(key);
        let bytes = match self.store.head(&path).await {
            Ok(meta) => meta.size,
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let rows = self
            .fetch_i64(
                &sql::file_rows(&self.named_collection, key),
                &format!("{step}-rows"),
            )
            .await?
            .try_into()
            .unwrap_or(0);
        if rows == 0 {
            self.store.delete(&path).await?;
            return Ok(None);
        }
        info!(
            key,
            rows,
            bytes,
            secs = started.elapsed().as_secs(),
            "data dump exported"
        );
        Ok(Some(Exported { rows, bytes }))
    }
}
