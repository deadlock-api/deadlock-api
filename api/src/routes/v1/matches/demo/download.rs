//! Download a full `.dem.bz2` from Valve's replay servers.
//!
//! Tries an 8-way ranged download and falls back to a single sequential stream
//! when the server does not honor byte ranges. The compressed bytes are returned
//! whole; decompression happens elsewhere.

use std::sync::LazyLock;

use bytes::{Bytes, BytesMut};
use futures::stream::{self, StreamExt, TryStreamExt};
use reqwest::StatusCode;
use reqwest::header::{CONTENT_RANGE, RANGE};

use crate::error::{APIError, APIResult};

/// Shared HTTP client for pulling demos off Valve's replay servers.
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

const WORKERS: usize = 8;
/// Below this size the probe overhead isn't worth it — just stream sequentially.
const MIN_PARALLEL_SIZE: u64 = 8 << 20; // 8 MiB

/// Download the full (still bzip2-compressed) demo into one contiguous buffer.
pub(super) async fn download_demo(url: &str) -> APIResult<Bytes> {
    match probe_ranges(url).await {
        Ok(Some(len)) if len >= MIN_PARALLEL_SIZE => match download_ranged(url, len).await {
            Ok(bytes) => Ok(bytes),
            // Any mid-flight failure falls back to the always-correct sequential path.
            Err(_) => download_sequential(url).await,
        },
        _ => download_sequential(url).await,
    }
}

/// Returns `Some(total_len)` when the server answers a 1-byte range request with a
/// `206` and a parseable total size; `None` means "ranges not supported, stream it".
async fn probe_ranges(url: &str) -> APIResult<Option<u64>> {
    let resp = HTTP_CLIENT
        .get(url)
        .header(RANGE, "bytes=0-0")
        .send()
        .await?
        .error_for_status()
        .map_err(|e| not_found(&e))?;

    if resp.status() != StatusCode::PARTIAL_CONTENT {
        return Ok(None);
    }

    // Content-Range: bytes 0-0/123456  → total size sits after the '/'.
    let total = resp
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.rsplit('/').next())
        .and_then(|s| s.trim().parse::<u64>().ok());
    Ok(total)
}

async fn download_ranged(url: &str, len: u64) -> APIResult<Bytes> {
    let chunk = len.div_ceil(WORKERS as u64);
    let ranges: Vec<(usize, u64, u64)> = (0..WORKERS)
        .map(|idx| {
            let start = idx as u64 * chunk;
            (idx, start, (start + chunk).min(len))
        })
        .filter(|(_, start, end)| start < end)
        .collect();

    let mut slots: Vec<Option<Bytes>> = vec![None; ranges.len()];
    let mut tasks = stream::iter(ranges.into_iter().map(|(idx, start, end)| async move {
        let resp = HTTP_CLIENT
            .get(url)
            .header(RANGE, format!("bytes={start}-{}", end - 1))
            .send()
            .await?
            .error_for_status()?;
        // A worker that got 200 means the server silently ignored the range.
        if resp.status() != StatusCode::PARTIAL_CONTENT {
            return Err(APIError::internal("range not honored mid-download"));
        }
        let body = resp.bytes().await?;
        if body.len() as u64 != end - start {
            return Err(APIError::internal("short range read"));
        }
        Ok::<_, APIError>((idx, body))
    }))
    .buffer_unordered(WORKERS);

    while let Some(res) = tasks.next().await {
        let (idx, body) = res?;
        slots[idx] = Some(body);
    }

    let mut out = BytesMut::with_capacity(usize::try_from(len).unwrap_or(usize::MAX));
    for slot in slots {
        out.extend_from_slice(&slot.ok_or_else(|| APIError::internal("missing chunk"))?);
    }
    Ok(out.freeze())
}

async fn download_sequential(url: &str) -> APIResult<Bytes> {
    let body = HTTP_CLIENT
        .get(url)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| not_found(&e))?
        .bytes_stream()
        .map_err(std::io::Error::other)
        .try_fold(BytesMut::new(), |mut acc, b| async move {
            acc.extend_from_slice(&b);
            Ok(acc)
        })
        .await?;
    Ok(body.freeze())
}

fn not_found(e: &reqwest::Error) -> APIError {
    APIError::status_msg(
        StatusCode::NOT_FOUND,
        format!("Failed to download demo: {e}"),
    )
}
