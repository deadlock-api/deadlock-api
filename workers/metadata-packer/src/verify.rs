//! Compares random packed files with the loose objects they were packed from, through the same
//! reader the API uses. Only rows that are packed and not yet deleted can be compared.

use std::sync::Arc;

use futures::StreamExt as _;
use metadata_packs::{Kind, PackReader};
use object_store::ObjectStoreExt as _;
use object_store::path::Path;
use tracing::warn;

use crate::{Ctx, Error};

#[derive(Debug, Default)]
pub(crate) struct Report {
    pub(crate) checked: usize,
    pub(crate) matched: usize,
    pub(crate) mismatched: usize,
    /// A newer pack holds other bytes for the same match and kind; this row's bytes stay in its
    /// own (older) pack.
    pub(crate) superseded: usize,
    /// The source is gone (deleted meanwhile): nothing to compare.
    pub(crate) skipped: usize,
    pub(crate) errors: usize,
}

enum Check {
    Match,
    Mismatch,
    Superseded,
    Skipped,
    Error,
}

pub(crate) async fn verify_sample(ctx: &Ctx, count: usize) -> Result<Report, Error> {
    let limit = i64::try_from(count).unwrap_or(i64::MAX);
    let mut rows: Vec<(String, String, i64, i16, i64)> = sqlx::query_as(
        "SELECT bucket, key, match_id, kind, pack_id FROM metadata_pack_sources TABLESAMPLE SYSTEM (1)
         WHERE state = 1 LIMIT $1",
    )
    .bind(limit)
    .fetch_all(ctx.pg())
    .await?;
    // A 1% sample of a small queue can come back (nearly) empty.
    if rows.len() < count / 2 {
        rows = sqlx::query_as(
            "SELECT bucket, key, match_id, kind, pack_id FROM metadata_pack_sources
             WHERE state = 1 ORDER BY random() LIMIT $1",
        )
        .bind(limit)
        .fetch_all(ctx.pg())
        .await?;
    }
    let reader = PackReader::new(
        ctx.index.clone(),
        vec![Arc::clone(&ctx.packs.store)],
        &ctx.cfg.prefix,
    );
    let checks: Vec<Check> = futures::stream::iter(rows)
        .map(|(bucket, key, match_id, kind, row_pack)| {
            let reader = &reader;
            async move {
                let (Ok(match_id), Some(kind), Some(store)) = (
                    u64::try_from(match_id),
                    Kind::from_i16(kind),
                    ctx.bucket(&bucket),
                ) else {
                    return Check::Error;
                };
                ctx.limiter.acquire().await;
                let packed = match reader.get(match_id, &[kind]).await {
                    Ok(Some((bytes, _))) => bytes,
                    Ok(None) => {
                        warn!("{key}: packed in the queue but not in the index");
                        return Check::Mismatch;
                    }
                    Err(e) => {
                        warn!("{key}: reading the pack failed: {e}");
                        return Check::Error;
                    }
                };
                ctx.limiter.acquire().await;
                let source = match async {
                    store
                        .store
                        .get(&Path::from(key.as_str()))
                        .await?
                        .bytes()
                        .await
                }
                .await
                {
                    Ok(bytes) => bytes,
                    Err(object_store::Error::NotFound { .. }) => return Check::Skipped,
                    Err(e) => {
                        warn!("{key}: reading the source failed: {e}");
                        return Check::Error;
                    }
                };
                if packed == source {
                    Check::Match
                } else if reader
                    .index()
                    .lookup(match_id, &[kind])
                    .await
                    .ok()
                    .flatten()
                    .is_some_and(|loc| u64::try_from(row_pack).ok() != Some(loc.pack_id))
                {
                    Check::Superseded
                } else {
                    warn!("{key} differs from its packed copy");
                    Check::Mismatch
                }
            }
        })
        .buffer_unordered(32)
        .collect()
        .await;
    let mut report = Report::default();
    for check in checks {
        report.checked = report.checked.saturating_add(1);
        match check {
            Check::Match => report.matched = report.matched.saturating_add(1),
            Check::Mismatch => report.mismatched = report.mismatched.saturating_add(1),
            Check::Superseded => report.superseded = report.superseded.saturating_add(1),
            Check::Skipped => report.skipped = report.skipped.saturating_add(1),
            Check::Error => report.errors = report.errors.saturating_add(1),
        }
    }
    Ok(report)
}
