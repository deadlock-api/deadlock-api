use crate::{
    cursors::RawCursor,
    error::{Error, Result},
    query_summary::QuerySummary,
    response::Response,
};
use bytes::{Buf as _, Bytes, BytesMut};
use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};
use futures_util::TryFutureExt as _;
use std::io::Result as IoResult;
use tokio::io::{AsyncBufRead, AsyncRead, ReadBuf};
use tracing::Instrument as _;

/// A cursor over raw bytes of the response returned by [`Query::fetch_bytes`].
///
/// Unlike [`RowCursor`] which emits rows deserialized as structures from
/// `RowBinary`, this cursor emits raw bytes without deserialization.
///
/// # Integration
///
/// Additionally to [`BytesCursor::next`] and [`BytesCursor::collect`],
/// this cursor implements:
/// * [`AsyncRead`] and [`AsyncBufRead`] for `tokio`-based ecosystem.
/// * [`futures_util::Stream`], [`futures_util::AsyncRead`] and
///   [`futures_util::AsyncBufRead`] for `futures`-based ecosystem.
///   (requires the `futures03` feature)
///
/// For instance, if the requested format emits each row on a newline
/// (e.g. `JSONEachRow`, `CSV`, `TSV`, etc.), the cursor can be read line by
/// line using `AsyncBufReadExt::lines`. Note that this method
/// produces a new `String` for each line, so it's not the most performant way
/// to iterate.
///
/// Note: methods of these traits use [`std::io::Error`] for errors.
/// To get an original error from this crate, use `From` conversion.
///
/// [`RowCursor`]: crate::query::RowCursor
/// [`Query::fetch_bytes`]: crate::query::Query::fetch_bytes
pub struct BytesCursor {
    raw: RawCursor,
    bytes: Bytes,
    span: tracing::Span,
}

impl core::fmt::Debug for BytesCursor {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BytesCursor")
            .field("buffered", &self.bytes.len())
            .finish_non_exhaustive()
    }
}

/// The error of mixing the chunk API (`next`, `poll_next`, `Stream`) with `AsyncRead`.
#[cold]
fn mixed_api_error(method: &str) -> Error {
    Error::Unsupported(format!(
        "mixing `{method}` and `AsyncRead` API methods is not allowed"
    ))
}

// TODO: what if any next/poll_* called AFTER error returned?

impl BytesCursor {
    pub(crate) fn new(response: Response, span: tracing::Span) -> Self {
        Self {
            raw: RawCursor::new(response),
            bytes: Bytes::default(),
            span,
        }
    }

    /// Emits the next bytes chunk.
    ///
    /// # Cancel safety
    ///
    /// This method is cancellation safe.
    pub async fn next(&mut self) -> Result<Option<Bytes>> {
        if !self.bytes.is_empty() {
            return Err(mixed_api_error("BytesCursor::next()"));
        }

        self.raw
            .next()
            .inspect_err(|e| tracing::debug!(error=?e, "error from BytesCursor::next()"))
            .instrument(self.span.clone())
            .await
    }

    /// Poll for the next chunk of bytes.
    #[inline]
    #[cfg_attr(
        feature = "futures03",
        expect(
            clippy::same_name_method,
            reason = "public API; `Stream::poll_next` has a different signature"
        )
    )]
    pub fn poll_next(&mut self, cx: &mut Context<'_>) -> Poll<Result<Option<Bytes>>> {
        if !self.bytes.is_empty() {
            return Poll::Ready(Err(mixed_api_error("BytesCursor::poll_next()")));
        }

        let _guard = self.span.enter();

        self.raw.poll_next(cx)
    }

    /// Collects the whole response into a single [`Bytes`].
    ///
    /// # Cancel safety
    ///
    /// This method is NOT cancellation safe.
    /// If cancelled, already collected bytes are lost.
    pub async fn collect(&mut self) -> Result<Bytes> {
        let mut chunks = Vec::new();
        let mut total_len = 0;

        while let Some(chunk) = self.next().await? {
            total_len = chunk.len().saturating_add(total_len);
            chunks.push(chunk);
        }

        // The whole response is in a single chunk.
        if chunks.len() == 1
            && let Some(chunk) = chunks.pop()
        {
            return Ok(chunk);
        }

        let mut collected = BytesMut::with_capacity(total_len);
        for chunk in chunks {
            collected.extend_from_slice(&chunk);
        }

        Ok(collected.freeze())
    }

    #[cold]
    fn poll_refill(&mut self, cx: &mut Context<'_>) -> Poll<IoResult<bool>> {
        let _guard = self.span.enter();

        // Theoretically, `self.raw.poll_next(cx)` can return empty chunks.
        // In this case, we should continue polling until we get a non-empty chunk or
        // end of stream in order to avoid false positive `Ok(0)` in I/O traits.
        while self.bytes.is_empty() {
            match ready!(self.raw.poll_next(cx)) {
                Ok(Some(chunk)) => self.bytes = chunk,
                Ok(None) => return Poll::Ready(Ok(false)),
                Err(e) => {
                    tracing::debug!(error=?e, "error reading from cursor");
                    return Poll::Ready(Err(e.into()));
                }
            }
        }

        Poll::Ready(Ok(true))
    }

    /// Returns the total size in bytes received from the CH server since
    /// the cursor was created.
    ///
    /// This method counts only size without HTTP headers for now.
    /// It can be changed in the future without notice.
    #[inline]
    pub const fn received_bytes(&self) -> u64 {
        self.raw.received_bytes()
    }

    /// Returns the total size in bytes decompressed since the cursor was
    /// created.
    #[inline]
    pub const fn decoded_bytes(&self) -> u64 {
        self.raw.decoded_bytes()
    }

    /// Returns the parsed `X-ClickHouse-Summary` response header, if
    /// present. Available once the response headers have been received.
    ///
    /// Note: the summary values may be incomplete unless the query was
    /// executed with `wait_end_of_query=1`.
    #[inline]
    pub fn summary(&self) -> Option<&QuerySummary> {
        self.raw.summary()
    }

    #[inline]
    #[doc(hidden)]
    pub const fn _priv_span(&self) -> &tracing::Span {
        &self.span
    }
}

impl AsyncRead for BytesCursor {
    #[inline]
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<IoResult<()>> {
        while buf.remaining() > 0 {
            if self.bytes.is_empty() && !ready!(self.poll_refill(cx)?) {
                break;
            }

            let len = self.bytes.len().min(buf.remaining());
            buf.put_slice(self.bytes.get(..len).unwrap_or_default());
            self.bytes.advance(len);
        }

        Poll::Ready(Ok(()))
    }
}

impl AsyncBufRead for BytesCursor {
    #[inline]
    fn poll_fill_buf(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<IoResult<&[u8]>> {
        if self.bytes.is_empty() {
            ready!(self.poll_refill(cx)?);
        }

        Poll::Ready(Ok(&self.get_mut().bytes))
    }

    #[inline]
    fn consume(mut self: Pin<&mut Self>, amt: usize) {
        // Consuming more than the buffered bytes is a misuse; consume what is buffered.
        let amt = amt.min(self.bytes.len());
        self.bytes.advance(amt);
    }
}

impl Drop for BytesCursor {
    fn drop(&mut self) {
        let _span = self.span.enter();

        tracing::record_all!(
            self.span,
            clickhouse.response.received_bytes = self.received_bytes(),
            clickhouse.response.decoded_bytes = self.decoded_bytes(),
        );

        tracing::debug!("finished raw query");
    }
}

#[cfg(feature = "futures03")]
impl futures_util::AsyncRead for BytesCursor {
    #[inline]
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<IoResult<usize>> {
        let mut buf = ReadBuf::new(buf);
        ready!(AsyncRead::poll_read(self, cx, &mut buf)?);
        Poll::Ready(Ok(buf.filled().len()))
    }
}

#[cfg(feature = "futures03")]
impl futures_util::AsyncBufRead for BytesCursor {
    #[inline]
    fn poll_fill_buf(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<IoResult<&[u8]>> {
        AsyncBufRead::poll_fill_buf(self, cx)
    }

    #[inline]
    fn consume(self: Pin<&mut Self>, amt: usize) {
        AsyncBufRead::consume(self, amt);
    }
}

#[cfg(feature = "futures03")]
impl futures_util::stream::Stream for BytesCursor {
    type Item = crate::error::Result<bytes::Bytes>;

    #[inline]
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if !self.bytes.is_empty() {
            return Poll::Ready(Some(Err(mixed_api_error("Stream"))));
        }

        let this = &mut *self;

        let _guard = this.span.enter();

        this.raw.poll_next(cx).map(Result::transpose)
    }
}

#[cfg(feature = "futures03")]
impl futures_util::stream::FusedStream for BytesCursor {
    #[inline]
    fn is_terminated(&self) -> bool {
        self.bytes.is_empty() && self.raw.is_terminated()
    }
}
