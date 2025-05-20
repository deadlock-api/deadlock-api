use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use arrow::csv::Writer;
use arrow::record_batch::RecordBatchWriter;
use axum::extract::{Query, State};
use duckdb::Config;
use duckdb::arrow::record_batch::RecordBatch;
use futures::StreamExt;
use object_store::ObjectStore;
use object_store::path::Path;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, error};
use utoipa::IntoParams;

const BASE_URL: &str = "https://s3-cache.deadlock-api.com/db-snapshot/public/";

#[derive(Error, Debug)]
enum SQLError {
    #[error("Failed to connect to database: {0}")]
    Query(#[from] duckdb::Error),
    #[error("Failed to write CSV: {0}")]
    Writer(#[from] arrow::error::ArrowError),
    #[error("Failed to convert to UTF8: {0}")]
    UTF8(#[from] std::string::FromUtf8Error),
}

#[derive(Deserialize, IntoParams)]
pub struct SQLQuery {
    pub query: String,
}

async fn map_table_parquet_files(
    s3_db_snapshot_client: &object_store::aws::AmazonS3,
) -> object_store::Result<HashMap<String, Vec<String>>> {
    let mut list = s3_db_snapshot_client.list(Some(&Path::from("public/")));
    let mut parquet_files = vec![];
    while let Some(r) = list.next().await {
        let location = r?.location.to_string();
        if !location.ends_with(".parquet") {
            continue;
        }
        parquet_files.push(
            location
                .strip_prefix("public/")
                .unwrap_or(&location)
                .to_string(),
        );
    }

    let mut result = HashMap::new();
    for parquet_file in parquet_files {
        if let Some(mut table) = parquet_file.split('/').next_back() {
            if parquet_file.starts_with("match_metadata") && table.starts_with("match_info") {
                table = "match_info";
            }
            if parquet_file.starts_with("match_metadata") && table.starts_with("match_player") {
                table = "match_player";
            }
            table = table.strip_suffix(".parquet").unwrap_or(table);
            result
                .entry(table.to_string())
                .or_insert(vec![])
                .push(parquet_file);
        }
    }
    Ok(result)
}

fn replace_table_names(
    parquet_files: impl IntoIterator<Item = (String, Vec<String>)>,
    query: &str,
) -> String {
    let mut query = query.to_string();
    for (table, urls) in parquet_files.into_iter() {
        let full_urls: Vec<String> = urls
            .iter()
            .map(|url| format!("{}{}", BASE_URL, url))
            .collect();
        query = query.replace(
            &format!(" {}", table),
            &format!(" read_parquet({:?})", full_urls),
        );
    }
    query
}
fn execute_query_to_csv(query: &str) -> Result<String, SQLError> {
    let config = Config::default().max_memory("4GB")?.threads(2)?;
    let conn = duckdb::Connection::open_in_memory_with_flags(config)?;
    let mut stmt = conn.prepare(query)?;
    let arrow_record_batch_reader = stmt.query_arrow([])?;

    let mut batches: Vec<RecordBatch> = Vec::new();
    for batch_result in arrow_record_batch_reader {
        batches.push(batch_result);
    }

    let mut csv_buffer = Vec::new();
    let mut csv_writer = Writer::new(&mut csv_buffer);
    for batch in batches {
        csv_writer.write(&batch)?;
    }
    csv_writer.close()?;

    Ok(csv_buffer.try_into()?)
}

#[utoipa::path(
    get,
    path = "/",
    params(SQLQuery),
    responses(
        (status = OK, body = String),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["SQL"],
    summary = "SQL Query",
    description = "Executes a SQL query on the database."
)]
pub async fn sql(
    rate_limit_key: RateLimitKey,
    Query(SQLQuery { query }): Query<SQLQuery>,
    State(state): State<AppState>,
) -> APIResult<String> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "sql",
            &[
                RateLimitQuota::ip_limit(10, Duration::from_secs(60)),
                RateLimitQuota::global_limit(100, Duration::from_secs(60)),
            ],
        )
        .await?;

    let parquet_files = map_table_parquet_files(&state.s3_db_snapshot_client)
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to list parquet files: {e}"),
        })?;
    let replaced_query = replace_table_names(parquet_files, &query);
    debug!("{replaced_query:#?}");

    execute_query_to_csv(&replaced_query).map_err(|e| {
        error!("Error executing query: {e}");
        APIError::InternalError {
            message: format!("Failed to execute query: {e}"),
        }
    })
}
