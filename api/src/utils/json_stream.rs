use axum::body::{Body, Bytes};
use clickhouse::query::BytesCursor;
use serde::{Deserialize, Serialize};
use tokio::io::Lines;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
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
                let mut buf = Vec::with_capacity(line.len() + 1);
                buf.extend_from_slice(line.as_bytes());
                buf.push(b'\n');
                return Ok(Some((Bytes::from(buf), (lines, None, false))));
            }
            if let Some(first) = first {
                let mut buf = Vec::with_capacity(first.len() + 1);
                buf.push(b'[');
                buf.extend_from_slice(first.as_bytes());
                return Ok(Some((Bytes::from(buf), (lines, None, false))));
            }
            match lines.next_line().await? {
                Some(line) => {
                    let mut buf = Vec::with_capacity(line.len() + 1);
                    buf.push(b',');
                    buf.extend_from_slice(line.as_bytes());
                    Ok(Some((Bytes::from(buf), (lines, None, false))))
                }
                None => Ok(Some((Bytes::from_static(b"]"), (lines, None, true)))),
            }
        },
    );
    Ok(Some(Body::from_stream(stream)))
}
