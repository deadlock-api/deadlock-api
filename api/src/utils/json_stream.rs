use axum::body::{Body, Bytes};
use clickhouse::query::BytesCursor;
use serde::{Deserialize, Serialize};
use tokio::io::Lines;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
#[schema(default = "json")]
pub(crate) enum ResponseFormat {
    #[default]
    Json,
    Ndjson,
}

impl ResponseFormat {
    pub(crate) fn content_type(self) -> &'static str {
        match self {
            Self::Json => "application/json",
            Self::Ndjson => "application/x-ndjson",
        }
    }
}

/// `line` wrapped in an optional one-byte prefix and suffix, in a single allocation.
fn chunk(prefix: Option<u8>, line: &str, suffix: Option<u8>) -> Bytes {
    let mut buf = Vec::with_capacity(line.len() + 2);
    buf.extend(prefix);
    buf.extend_from_slice(line.as_bytes());
    buf.extend(suffix);
    Bytes::from(buf)
}

pub(crate) async fn stream_rows(
    mut lines: Lines<BytesCursor>,
    format: ResponseFormat,
) -> std::io::Result<Option<Body>> {
    let Some(first) = lines.next_line().await? else {
        return Ok(None);
    };
    let stream = futures::stream::try_unfold(
        (lines, Some(first), false),
        move |(mut lines, first, closed)| async move {
            if closed {
                return Ok::<_, std::io::Error>(None);
            }
            if format == ResponseFormat::Ndjson {
                let line = match first {
                    Some(first) => first,
                    None => match lines.next_line().await? {
                        Some(line) => line,
                        None => return Ok(None),
                    },
                };
                return Ok(Some((
                    chunk(None, &line, Some(b'\n')),
                    (lines, None, false),
                )));
            }
            if let Some(first) = first {
                return Ok(Some((
                    chunk(Some(b'['), &first, None),
                    (lines, None, false),
                )));
            }
            match lines.next_line().await? {
                Some(line) => Ok(Some((chunk(Some(b','), &line, None), (lines, None, false)))),
                None => Ok(Some((Bytes::from_static(b"]"), (lines, None, true)))),
            }
        },
    );
    Ok(Some(Body::from_stream(stream)))
}
