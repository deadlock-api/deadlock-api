use crate::{
    error::{Error, Result},
    query_summary::QuerySummary,
    response::{Chunks, Response, ResponseFuture},
};
use bytes::Bytes;
use core::{
    pin::pin,
    task::{Context, Poll, ready},
};
use futures_util::Stream as _;

/// A cursor over raw bytes of a query response.
/// All other cursors are built on top of this one.
pub(crate) struct RawCursor(RawCursorState);

enum RawCursorState {
    Waiting(ResponseFuture),
    Loading(RawCursorLoading),
}

struct RawCursorLoading {
    chunks: Chunks,
    summary: Option<Box<QuerySummary>>,
    net_size: u64,
    data_size: u64,
}

impl RawCursor {
    pub(crate) fn new(response: Response) -> Self {
        Self(RawCursorState::Waiting(response.into_future()))
    }

    pub(crate) async fn next(&mut self) -> Result<Option<Bytes>> {
        core::future::poll_fn(|cx| self.poll_next(cx)).await
    }

    pub(crate) fn poll_next(&mut self, cx: &mut Context<'_>) -> Poll<Result<Option<Bytes>>> {
        if let RawCursorState::Loading(state) = &mut self.0 {
            let chunks = pin!(&mut state.chunks);

            Poll::Ready(if let Some(chunk) = ready!(chunks.poll_next(cx)?) {
                state.net_size = state.net_size.saturating_add(chunk.net_size as u64);
                state.data_size = state.data_size.saturating_add(chunk.data.len() as u64);
                Ok(Some(chunk.data))
            } else {
                // The native TCP transport sends the summary at the end of the response.
                #[cfg(feature = "tcp")]
                if let Some(summary) = state.chunks.take_final_summary() {
                    state.summary = Some(summary);
                }

                Ok(None)
            })
        } else {
            ready!(self.poll_resolve(cx)?);
            self.poll_next(cx)
        }
    }

    #[cold]
    #[inline(never)]
    fn poll_resolve(&mut self, cx: &mut Context<'_>) -> Poll<Result<()>> {
        let RawCursorState::Waiting(future) = &mut self.0 else {
            return Poll::Ready(Err(Error::Other(
                "BUG: poll_resolve called in invalid state".into(),
            )));
        };

        // Poll the future, but don't return the result yet.
        // In case of an error, we should replace the current state anyway
        // in order to provide proper fused behavior of the cursor.
        let res = ready!(future.as_mut().poll(cx));
        let mut chunks = Chunks::empty();
        let mut summary = None;
        let res = res
            .map(|(c, s)| {
                chunks = c;
                summary = s;
            })
            .inspect_err(|e| e.record_in_current_span("response error"));

        self.0 = RawCursorState::Loading(RawCursorLoading {
            chunks,
            summary,
            net_size: 0,
            data_size: 0,
        });

        Poll::Ready(res)
    }

    pub(crate) const fn received_bytes(&self) -> u64 {
        match &self.0 {
            RawCursorState::Loading(state) => state.net_size,
            RawCursorState::Waiting(_) => 0,
        }
    }

    pub(crate) const fn decoded_bytes(&self) -> u64 {
        match &self.0 {
            RawCursorState::Loading(state) => state.data_size,
            RawCursorState::Waiting(_) => 0,
        }
    }

    pub(crate) fn summary(&self) -> Option<&QuerySummary> {
        match &self.0 {
            RawCursorState::Loading(state) => state.summary.as_deref(),
            RawCursorState::Waiting(_) => None,
        }
    }

    #[cfg(feature = "futures03")]
    pub(crate) const fn is_terminated(&self) -> bool {
        match &self.0 {
            RawCursorState::Loading(state) => state.chunks.is_terminated(),
            RawCursorState::Waiting(_) => false,
        }
    }
}
