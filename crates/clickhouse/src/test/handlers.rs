use core::marker::PhantomData;

use bytes::Bytes;
use futures_channel::oneshot;
use hyper::{
    Request, Response, StatusCode,
    header::{HeaderName, HeaderValue},
};
use serde::Serialize;

use super::{Handler, HandlerFn};
use crate::{Row, RowOwned, RowRead, rowbinary};

const BUFFER_INITIAL_CAPACITY: usize = 1024;

// === Thunk ===

struct Thunk(Response<Bytes>);

impl super::sealed::Sealed for Thunk {}

impl super::Handler for Thunk {
    type Control = ();

    fn make(self) -> (HandlerFn, Self::Control) {
        (Box::new(|_| self.0), ())
    }
}

/// A response that makes the request fail, used if a handler cannot be built.
fn invalid_handler(message: String) -> Thunk {
    tracing::error!("invalid mock handler: {message}");
    let mut response = Response::new(Bytes::from(message));
    *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
    Thunk(response)
}

// === failure ===

#[track_caller]
#[must_use]
pub fn failure(status: StatusCode) -> impl Handler {
    let reason = status.canonical_reason().unwrap_or("<unknown status code>");

    let mut response = Response::new(Bytes::from(reason));
    *response.status_mut() = status;
    Thunk(response)
}

#[track_caller]
#[must_use]
pub fn exception(code: u8) -> impl Handler {
    let mut response = Response::new(Bytes::new());
    response.headers_mut().insert(
        HeaderName::from_static("x-clickhouse-exception-code"),
        HeaderValue::from(u16::from(code)),
    );
    Thunk(response)
}
// === provide ===

#[track_caller]
pub fn provide<T>(rows: impl IntoIterator<Item = T>) -> impl Handler
where
    T: Serialize + Row,
{
    let mut buffer = Vec::with_capacity(BUFFER_INITIAL_CAPACITY);
    for row in rows {
        if let Err(err) = rowbinary::serialize_row_binary(&mut buffer, &row) {
            return invalid_handler(format!("failed to serialize: {err}"));
        }
    }
    Thunk(Response::new(buffer.into()))
}

// === provide_with_summary ===

/// Like [`provide`], but includes an `X-ClickHouse-Summary` response header.
#[track_caller]
pub fn provide_with_summary<T>(rows: impl IntoIterator<Item = T>, summary: &str) -> impl Handler
where
    T: Serialize + Row,
{
    let mut buffer = Vec::with_capacity(BUFFER_INITIAL_CAPACITY);
    for row in rows {
        if let Err(err) = rowbinary::serialize_row_binary(&mut buffer, &row) {
            return invalid_handler(format!("failed to serialize: {err}"));
        }
    }
    let summary = match HeaderValue::from_str(summary) {
        Ok(summary) => summary,
        Err(err) => return invalid_handler(format!("invalid summary header: {err}")),
    };
    let mut response = Response::new(Bytes::from(buffer));
    response
        .headers_mut()
        .insert(HeaderName::from_static("x-clickhouse-summary"), summary);
    Thunk(response)
}

// === record ===

struct RecordHandler<T>(PhantomData<T>);

impl<T> super::sealed::Sealed for RecordHandler<T> {}

impl<T> super::Handler for RecordHandler<T> {
    type Control = RecordControl<T>;

    #[doc(hidden)]
    fn make(self) -> (HandlerFn, Self::Control) {
        let (tx, rx) = oneshot::channel();
        let marker = PhantomData;
        let control = RecordControl { rx, marker };

        let h = Box::new(move |request: Request<Bytes>| -> Response<Bytes> {
            let body = request.into_body();
            if tx.send(body).is_err() {
                tracing::debug!("the recorded request body is not awaited");
            }
            Response::new(<_>::default())
        });

        (h, control)
    }
}

pub struct RecordControl<T> {
    rx: oneshot::Receiver<Bytes>,
    marker: PhantomData<T>,
}

impl<T> core::fmt::Debug for RecordControl<T> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("RecordControl").finish_non_exhaustive()
    }
}

impl<T> RecordControl<T>
where
    T: RowOwned + RowRead,
{
    /// Collects the recorded rows.
    ///
    /// If the query was canceled or a row cannot be deserialized, the error is reported
    /// with `tracing::error!` and the rows collected so far are returned.
    pub async fn collect<C>(self) -> C
    where
        C: Default + Extend<T>,
    {
        let mut result = C::default();
        let Ok(bytes) = self.rx.await else {
            tracing::error!("query canceled");
            return result;
        };
        let slice = &mut &*bytes;

        while !slice.is_empty() {
            match rowbinary::deserialize_row::<T>(slice, None) {
                Ok(row) => result.extend(core::iter::once(row)),
                Err(err) => {
                    tracing::error!(error = %err, "failed to deserialize");
                    break;
                }
            }
        }

        result
    }
}

#[track_caller]
#[must_use]
pub fn record<T>() -> impl Handler<Control = RecordControl<T>> {
    RecordHandler(PhantomData)
}

// === record_request ===

#[cfg(test)]
struct RecordRequestHandler;

#[cfg(test)]
impl super::sealed::Sealed for RecordRequestHandler {}

#[cfg(test)]
impl super::Handler for RecordRequestHandler {
    type Control = RecordRequestControl;

    #[doc(hidden)]
    fn make(self) -> (HandlerFn, Self::Control) {
        let (tx, rx) = oneshot::channel();
        let control = RecordRequestControl(rx);

        let handler = Box::new(move |request: Request<Bytes>| -> Response<Bytes> {
            if tx.send(request).is_err() {
                tracing::debug!("the recorded request is not awaited");
            }
            Response::new(Bytes::new())
        });

        (handler, control)
    }
}

#[cfg(test)]
pub(crate) struct RecordRequestControl(oneshot::Receiver<Request<Bytes>>);

#[cfg(test)]
impl RecordRequestControl {
    pub(crate) async fn request(self) -> Request<Bytes> {
        self.0.await.expect("query canceled")
    }
}

#[cfg(test)]
pub(crate) fn record_request() -> impl Handler<Control = RecordRequestControl> {
    RecordRequestHandler
}

// === record_ddl ===

struct RecordDdlHandler;

impl super::sealed::Sealed for RecordDdlHandler {}

impl super::Handler for RecordDdlHandler {
    type Control = RecordDdlControl;

    #[doc(hidden)]
    fn make(self) -> (HandlerFn, Self::Control) {
        let (tx, rx) = oneshot::channel();
        let control = RecordDdlControl(rx);

        let h = Box::new(move |request: Request<Bytes>| -> Response<Bytes> {
            let body = request.into_body();
            if tx.send(body).is_err() {
                tracing::debug!("the recorded request body is not awaited");
            }
            Response::new(<_>::default())
        });

        (h, control)
    }
}

#[derive(Debug)]
pub struct RecordDdlControl(oneshot::Receiver<Bytes>);

impl RecordDdlControl {
    /// Returns the recorded query.
    ///
    /// If the query was canceled, the error is reported with `tracing::error!` and
    /// an empty string is returned. Invalid UTF-8 is replaced and reported the same way.
    pub async fn query(self) -> String {
        let Ok(buffer) = self.0.await else {
            tracing::error!("query canceled");
            return String::new();
        };
        String::from_utf8(buffer.to_vec()).unwrap_or_else(|err| {
            tracing::error!(error = %err, "query is not DDL");
            String::from_utf8_lossy(err.as_bytes()).into_owned()
        })
    }
}

#[must_use]
pub fn record_ddl() -> impl Handler<Control = RecordDdlControl> {
    RecordDdlHandler
}
