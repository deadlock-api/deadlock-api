//! `match_salts` for GraphQL: the `match_salts` root query and the nested
//! `salts` enrichment on matches. Only ever reads what `ClickHouse` has stored.

use core::fmt::Write;

use async_graphql::{ComplexObject, InputObject, Result as GqlResult, SimpleObject};
use axum::http::StatusCode;
use clickhouse::Row;
use serde::Deserialize;
use tracing::{Instrument as _, debug, info_span};

use crate::context::AppState;
use crate::error::APIError;
use crate::routes::v1::graphql::filters::{U32Filter, U64Filter};
use crate::routes::v1::graphql::schema::run_query;
use crate::routes::v1::graphql::sql::OrderDir;
use crate::services::clickhouse_batcher::{BatchQuery, ClickhouseBatcher, in_clause};

const COLUMNS: &str =
    "match_id, cluster_id, metadata_salt, replay_salt, toUnixTimestamp(created_at) AS created_at";

/// Tail of a `match_salts FINAL` query that keeps the one row per match the
/// REST reader in `matches::salts` would serve: usable, not failed before
/// failed, verified first. A written-off candidate is only a last resort, see
/// the REST reader for why it is served at all. `FINAL` is required: an
/// unmerged verification stamp carries only the sorting key and would otherwise
/// hide a failure.
fn best_row_per_match(dir: &str) -> String {
    format!(
        "metadata_salt > 0 AND cluster_id > 0 \
         ORDER BY match_id {dir}, failed_at IS NULL DESC, verified_at IS NOT NULL DESC, \
         match_salts.created_at DESC \
         LIMIT 1 BY match_id"
    )
}

#[derive(Clone, Debug, Row, Deserialize, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
pub(crate) struct MatchSalts {
    pub(crate) match_id: u64,
    pub(crate) cluster_id: Option<u32>,
    pub(crate) metadata_salt: Option<u32>,
    pub(crate) replay_salt: Option<u32>,
    /// When the salts were stored, as a unix timestamp.
    pub(crate) created_at: u32,
}

impl MatchSalts {
    fn replay_url(&self, salt: Option<u32>, extension: &str) -> Option<String> {
        let (cluster_id, salt) = (self.cluster_id?, salt.filter(|s| *s > 0)?);
        Some(format!(
            "http://replay{cluster_id}.valve.net/1422450/{}_{salt}.{extension}.bz2",
            self.match_id
        ))
    }
}

#[ComplexObject(rename_fields = "snake_case")]
impl MatchSalts {
    async fn metadata_url(&self) -> Option<String> {
        self.replay_url(self.metadata_salt, "meta")
    }

    /// `null` when no replay salt is stored for the match.
    async fn demo_url(&self) -> Option<String> {
        self.replay_url(self.replay_salt, "dem")
    }
}

/// Filter input for the `match_salts` query. Operations across fields are AND-ed.
#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct MatchSaltsWhere {
    pub(super) match_id: Option<U64Filter>,
    pub(super) cluster_id: Option<U32Filter>,
}

impl MatchSaltsWhere {
    fn to_sql_filters(&self) -> Vec<String> {
        [
            self.match_id.as_ref().and_then(|f| f.to_sql("match_id")),
            self.cluster_id
                .as_ref()
                .and_then(|f| f.to_sql("cluster_id")),
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

/// Pages over the match ids without `FINAL` — reading the sorting key in order
/// stays a primary-key scan, while `FINAL` newest-first merges the whole table
/// (benchmarked 0.1s vs 7s). That is exact because the filterable columns are
/// all part of the sorting key, so they are the same before and after the merge.
/// Only the selected ids are then merged.
fn build_match_salts_query(
    filters: &[String],
    order_dir: OrderDir,
    limit: u32,
    offset: u32,
) -> Result<String, core::fmt::Error> {
    let filters = if filters.is_empty() {
        String::new()
    } else {
        format!("{} AND ", filters.join(" AND "))
    };
    let dir = order_dir.as_sql();
    let mut sql = String::new();
    write!(
        &mut sql,
        "WITH t_matches AS (SELECT DISTINCT match_id FROM match_salts \
         WHERE {filters}metadata_salt > 0 AND cluster_id > 0 \
         ORDER BY match_id {dir} LIMIT {limit} OFFSET {offset}) \
         SELECT {COLUMNS} FROM match_salts FINAL WHERE match_id IN t_matches AND {filters}{best} \
         SETTINGS log_comment = '{key}'",
        best = best_row_per_match(dir),
        key = super::RATE_LIMIT_KEY,
    )?;
    Ok(sql)
}

pub(super) async fn load_match_salts_page(
    state: &AppState,
    where_: Option<MatchSaltsWhere>,
    order_dir: OrderDir,
    limit: u32,
    offset: u32,
) -> GqlResult<Vec<MatchSalts>> {
    let filters = where_.map(|w| w.to_sql_filters()).unwrap_or_default();
    let sql = build_match_salts_query(&filters, order_dir, limit, offset)
        .map_err(|e| async_graphql::Error::new(format!("SQL build error: {e}")))?;
    debug!(?sql, "graphql.match_salts built sql");
    let rows = run_query::<MatchSalts>(&state.ch_client_ro, &sql)
        .instrument(info_span!("graphql.clickhouse", operation = "match_salts", sql = %sql))
        .await?;
    #[expect(clippy::cast_precision_loss)]
    metrics::histogram!("graphql_rows_returned", "operation" => "match_salts")
        .record(rows.len() as f64);
    Ok(rows)
}

pub(crate) struct MatchSaltsGraphQlQuery;

impl BatchQuery for MatchSaltsGraphQlQuery {
    type Key = u64;
    type Value = MatchSalts;

    fn build_query(keys: &[u64]) -> String {
        format!(
            "SELECT {COLUMNS} FROM match_salts FINAL WHERE match_id IN ({}) AND {} \
             SETTINGS log_comment = 'graphql_salts'",
            in_clause(keys),
            best_row_per_match("ASC"),
        )
    }

    fn key_of(value: &MatchSalts) -> u64 {
        value.match_id
    }
}

pub(crate) type MatchSaltsGraphQlBatcher = ClickhouseBatcher<MatchSaltsGraphQlQuery>;

/// Stored salts lookup for the nested `salts` resolvers: `None` when no usable
/// salts are stored for the match.
pub(super) async fn load_match_salts(
    state: &AppState,
    match_id: u64,
) -> GqlResult<Option<MatchSalts>> {
    match state.batchers.match_salts_graphql.load(match_id).await {
        Ok(salts) => Ok(Some(salts)),
        Err(APIError::StatusMsg {
            status: StatusCode::NOT_FOUND,
            ..
        }) => Ok(None),
        Err(e) => Err(async_graphql::Error::new(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn pages_ids_before_merging() {
        let sql =
            build_match_salts_query(&["match_id > 5".into()], OrderDir::Desc, 10, 20).unwrap();
        assert!(sql.starts_with(
            "WITH t_matches AS (SELECT DISTINCT match_id FROM match_salts WHERE match_id > 5 AND metadata_salt > 0 AND cluster_id > 0 ORDER BY match_id DESC LIMIT 10 OFFSET 20) "
        ));
        assert!(sql.contains("FROM match_salts FINAL WHERE match_id IN t_matches AND match_id > 5 AND metadata_salt > 0"));
        assert!(sql.contains(
            "ORDER BY match_id DESC, failed_at IS NULL DESC, verified_at IS NOT NULL DESC"
        ));
        assert!(!sql.contains("AND failed_at IS NULL"));
        assert!(!sql.contains("username"));
        assert_valid_sql(&sql);
    }

    #[test]
    fn urls_need_a_cluster_and_a_salt() {
        let salts = MatchSalts {
            match_id: 7,
            cluster_id: Some(3),
            metadata_salt: Some(11),
            replay_salt: None,
            created_at: 0,
        };
        assert_eq!(
            salts.replay_url(salts.metadata_salt, "meta").unwrap(),
            "http://replay3.valve.net/1422450/7_11.meta.bz2"
        );
        assert_eq!(salts.replay_url(salts.replay_salt, "dem"), None);
    }
}
