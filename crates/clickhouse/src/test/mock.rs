use core::{convert::Infallible, error::Error, fmt, net::SocketAddr};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
    thread,
};

use bytes::Bytes;
use http_body_util::{BodyExt as _, Full};
use hyper::{Request, Response, StatusCode, body::Incoming, server::conn, service};
use hyper_util::rt::TokioIo;
use tokio::{net::TcpListener, task::AbortHandle};

use super::{Handler, HandlerFn};

/// URL using a special hostname that `Client` can use to detect a mocked server.
///
/// This is to avoid breaking existing usages of the mock API which just call
/// `client.with_url(mock.url)`.
///
/// This domain should not resolve otherwise. The `.test` top-level domain
/// is reserved and cannot be registered on the open Internet.
const MOCKED_BASE_URL: &str = "http://mocked.clickhouse.test";

/// The real base URL where the mocked server is listening.
const REAL_BASE_URL: &str = "http://127.0.0.1";

type BoxedError = Box<dyn Error + Send + Sync>;

/// A mock server for testing.
///
/// Misuse (e.g. requests without a handler, or handlers left unused at the end of the test)
/// makes requests fail where possible and is reported with `tracing::error!`.
pub struct Mock {
    mocked_url: String,
    pub(crate) real_url: String,
    shared: Arc<Mutex<Shared>>,
    non_exhaustive: bool,
    /// `None` if the server could not be started.
    server_handle: Option<AbortHandle>,
}

impl fmt::Debug for Mock {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Mock")
            .field("mocked_url", &self.mocked_url)
            .field("real_url", &self.real_url)
            .field("non_exhaustive", &self.non_exhaustive)
            .finish_non_exhaustive()
    }
}

/// Shared between the server and the test.
#[derive(Default)]
struct Shared {
    handlers: VecDeque<HandlerFn>,
    /// An error from the background server task.
    /// Reported by the test side, see [`Mock::report_server_error()`].
    error: Option<BoxedError>,
}

/// Locks `shared`, ignoring poisoning: the data stays consistent across a panic.
fn lock(shared: &Mutex<Shared>) -> MutexGuard<'_, Shared> {
    shared.lock().unwrap_or_else(PoisonError::into_inner)
}

fn bind() -> Result<(SocketAddr, TcpListener), BoxedError> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = std::net::TcpListener::bind(addr)?;
    listener.set_nonblocking(true)?;
    let addr = listener.local_addr()?;
    let listener = TcpListener::from_std(listener)?;
    Ok((addr, listener))
}

impl Mock {
    /// Starts a new test server and returns a handle to it.
    ///
    /// If the server cannot be started, the error is reported with `tracing::error!`
    /// and requests to the mock fail.
    #[track_caller]
    #[must_use]
    pub fn new() -> Self {
        let shared = Arc::new(Mutex::new(Shared::default()));

        let (port, server_handle) = match bind() {
            Ok((addr, listener)) => {
                let server_handle = tokio::spawn(server(listener, Arc::clone(&shared)));
                (addr.port(), Some(server_handle.abort_handle()))
            }
            Err(err) => {
                tracing::error!(error = %err, "cannot start the mock server");
                lock(&shared).error = Some(err);
                (0, None)
            }
        };

        Self {
            mocked_url: format!("{MOCKED_BASE_URL}:{port}"),
            real_url: format!("{REAL_BASE_URL}:{port}"),
            non_exhaustive: false,
            server_handle,
            shared,
        }
    }

    /// Returns a test server's URL to provide into [`Client`].
    ///
    /// [`Client`]: crate::Client::with_url
    #[must_use]
    pub fn url(&self) -> &str {
        &self.mocked_url
    }

    pub(crate) fn real_url(&self) -> &str {
        &self.real_url
    }

    /// Returns `Some` if `url` was a mocked URL and converted to real, `None` if already real.
    pub(crate) fn mocked_url_to_real(url: &str) -> Option<String> {
        url.strip_prefix(MOCKED_BASE_URL)
            // rest = ":{port}"
            .map(|rest| format!("{REAL_BASE_URL}{rest}"))
    }

    /// Adds a handler to the test server for the next request.
    ///
    /// Can be called multiple times to enqueue multiple handlers.
    ///
    /// If [`Mock::non_exhaustive()`] is not called, the destructor reports an error
    /// if not all handlers are called by the end of the test.
    #[track_caller]
    pub fn add<H: Handler>(&self, handler: H) -> H::Control {
        self.report_server_error();

        if self
            .server_handle
            .as_ref()
            .is_none_or(AbortHandle::is_finished)
        {
            tracing::error!("impossible to add a handler: the test server is terminated");
        }

        let (handler, control) = handler.make();
        lock(&self.shared).handlers.push_back(handler);
        control
    }

    /// Allows unused handlers to be left after the test ends.
    pub const fn non_exhaustive(&mut self) {
        self.non_exhaustive = true;
    }

    #[track_caller]
    fn report_server_error(&self) {
        if let Some(error) = &lock(&self.shared).error {
            tracing::error!(%error, "mock server error");
        }
    }
}

impl Default for Mock {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Mock {
    fn drop(&mut self) {
        if let Some(server_handle) = &self.server_handle {
            server_handle.abort();
        }

        if thread::panicking() {
            return;
        }

        self.report_server_error();

        if !self.non_exhaustive && !lock(&self.shared).handlers.is_empty() {
            tracing::error!("test ended, but not all responses have been consumed");
        }
    }
}

async fn server(listener: TcpListener, shared: Arc<Mutex<Shared>>) {
    let error: BoxedError = loop {
        let stream = match listener.accept().await {
            Ok((stream, _)) => stream,
            Err(err) => break err.into(),
        };

        let serving = conn::http1::Builder::new()
            // N.B.: We set no timeouts here because it works incorrectly with
            // advanced time via `tokio::time::advance(duration)`.
            .keep_alive(false)
            .serve_connection(
                TokioIo::new(stream),
                service::service_fn(|request| handle(request, &shared)),
            );

        if let Err(err) = serving.await {
            break err.into();
        }
    };

    lock(&shared).error.get_or_insert(error);
}

async fn handle(
    request: Request<Incoming>,
    shared: &Mutex<Shared>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let response = do_handle(request, shared).await.unwrap_or_else(|err| {
        let bytes = Bytes::from(err.to_string());

        // Prevents further usage of the mock.
        lock(shared).error.get_or_insert(err);

        let mut response = Response::new(Full::new(bytes));
        *response.status_mut() = StatusCode::BAD_GATEWAY;
        response
    });

    Ok(response)
}

async fn do_handle(
    request: Request<Incoming>,
    shared: &Mutex<Shared>,
) -> Result<Response<Full<Bytes>>, BoxedError> {
    let Some(handler) = lock(shared).handlers.pop_front() else {
        // TODO: provide better error, e.g. some part of parsed body.
        return Err(format!("no installed handler for an incoming request: {request:?}").into());
    };

    let (parts, body) = request.into_parts();
    let body = body.collect().await?.to_bytes();

    let request = Request::from_parts(parts, body);
    let response = handler(request).map(Full::new);

    Ok(response)
}
