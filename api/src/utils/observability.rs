use core::fmt;
use core::time::Duration;

use axum::extract::MatchedPath;
use axum::http::{HeaderMap, Request, Response};
use tower_http::classify::ServerErrorsFailureClass;
use tracing::field::{Empty, Field, Visit};
use tracing::{Level, Span};
use tracing_subscriber::field::RecordFields;
use tracing_subscriber::fmt::FormatFields;
use tracing_subscriber::fmt::format::{DefaultFields, Writer};
use uuid::Uuid;

use crate::utils::parse;

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

/// Builds a richly-attributed tracing span for an incoming HTTP request.
///
/// Field names follow the OpenTelemetry semantic conventions for HTTP server
/// spans, so every exported span/trace (and every log emitted while the request
/// is in flight, via the active span) carries the matched endpoint route, the
/// full URL and other useful request context in any OTLP backend.
pub(crate) fn make_request_span<B>(request: &Request<B>) -> Span {
    let method = request.method();
    let uri = request.uri();
    let headers = request.headers();

    // Route template that handled this request, e.g. `/v1/players/{account_id}/steam`.
    // Falls back to the raw path for unmatched routes (404s, etc.).
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map_or_else(|| uri.path(), MatchedPath::as_str);

    let path = uri.path();

    // Scheme/host as seen by the client, honouring the reverse-proxy headers.
    let scheme = header_str(headers, "x-forwarded-proto")
        .or_else(|| uri.scheme_str())
        .unwrap_or("http");
    let host = header_str(headers, "x-forwarded-host")
        .or_else(|| header_str(headers, "host"))
        .or_else(|| uri.host())
        .unwrap_or("");

    // Sanitised query string (api_key stripped) for both `url.query` and `url.full`.
    let raw_query = uri.query().unwrap_or_default();
    let mut query_pairs = parse::querify(raw_query);
    query_pairs.retain(|(k, _)| *k != "api_key");
    let query = query_pairs
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");

    // Full URL, e.g. `https://api.deadlock-api.com/v1/players/123/steam?foo=bar`.
    let url_full = if query.is_empty() {
        format!("{scheme}://{host}{path}")
    } else {
        format!("{scheme}://{host}{path}?{query}")
    };

    let user_agent = header_str(headers, "user-agent").unwrap_or_default();

    let client_ip = header_str(headers, "cf-connecting-ip")
        .or_else(|| header_str(headers, "x-forwarded-for").and_then(|s| s.split(',').next()))
        .or_else(|| header_str(headers, "x-real-ip"))
        .map(str::trim)
        .unwrap_or_default();

    let api_key = header_str(headers, "x-api-key")
        .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(s)).ok());

    // Correlation id provided by the reverse proxy (Cloudflare Ray id / request id).
    let request_id = header_str(headers, "x-request-id")
        .or_else(|| header_str(headers, "cf-ray"))
        .unwrap_or_default();

    // Human-friendly span name, e.g. `GET /v1/players/{account_id}/steam`.
    let otel_name = format!("{method} {route}");

    tracing::span!(
        Level::INFO,
        "request",
        otel.name = %otel_name,
        otel.kind = "server",
        http.request.method = %method,
        http.route = %route,
        http.request.id = %request_id,
        http.response.status_code = Empty,
        url.full = %url_full,
        url.path = %path,
        url.scheme = %scheme,
        url.query = %query,
        server.address = %host,
        network.protocol.version = ?request.version(),
        user_agent.original = %user_agent,
        client.address = %client_ip,
        deadlock.api_key = ?api_key,
    )
}

/// Records the response status onto the request span and emits a response event,
/// so the status code becomes a span/trace attribute and shows up in logs.
pub(crate) fn on_response<B>(response: &Response<B>, latency: Duration, span: &Span) {
    let status = response.status().as_u16();
    span.record("http.response.status_code", status);
    let latency_ms = u64::try_from(latency.as_millis()).unwrap_or(u64::MAX);
    tracing::info!(http.response.status_code = status, latency_ms, "response");
}

/// Replacement for `tower_http`'s `DefaultOnFailure` that distinguishes *why* a
/// request was classified as a failure instead of logging a bare "response
/// failed" for every case.
///
/// The default classifier (`ServerErrorsAsFailures`) treats two very different
/// situations as failures:
///   * a response with a `5xx` status code — a genuine server error, and
///   * an error from the inner service or the *response body stream* — most
///     often a client that disconnected before the body finished (broken pipe),
///     which is not a server bug at all.
///
/// All the request context (route, full url, method, status, request id, …) is
/// already attached via the request span, so here we only add the failure
/// classification and downgrade the noisy client-disconnect case to `WARN`.
pub(crate) fn on_failure(
    classification: ServerErrorsFailureClass,
    latency: Duration,
    _span: &Span,
) {
    let latency_ms = u64::try_from(latency.as_millis()).unwrap_or(u64::MAX);
    match classification {
        ServerErrorsFailureClass::StatusCode(status) => {
            tracing::error!(
                http.response.status_code = status.as_u16(),
                latency_ms,
                "response failed: server error status"
            );
        }
        // Inner service / response-body stream error. Usually a client that
        // hung up mid-response, so log at WARN to keep ERROR for real faults.
        ServerErrorsFailureClass::Error(error) => {
            tracing::warn!(error, latency_ms, "response failed: stream/service error");
        }
    }
}

/// Maps a rich OTel-semantic span field name to the short label the console used
/// before the OTLP migration. Returns `None` for any field that should not be
/// printed to the console.
///
/// The request span ([`make_request_span`]) carries the full set of OpenTelemetry
/// HTTP semantic-convention fields so the OTLP trace/log exporters stay complete.
/// The console, however, only wants the original `request` span fields —
/// `method`, `path`, `query`, `api_key`, `ip` — no more, no less.
fn console_label(name: &str) -> Option<&'static str> {
    Some(match name {
        "http.request.method" => "method",
        "url.path" => "path",
        "url.query" => "query",
        "deadlock.api_key" => "api_key",
        "client.address" => "ip",
        _ => return None,
    })
}

/// `FormatFields` implementation for the console fmt layer.
///
/// Events (log records, identified by carrying a `message` field) are formatted
/// with the default formatter so nothing is lost from log lines. Span field sets
/// — i.e. the `request` span wrapping every log line — are reduced to the legacy
/// console field set via [`console_label`], keeping console output identical to
/// the pre-OTLP behaviour while the spans still export their full attribute set.
#[derive(Default)]
pub struct ConsoleFields {
    default: DefaultFields,
}

impl<'writer> FormatFields<'writer> for ConsoleFields {
    fn format_fields<R: RecordFields>(
        &self,
        mut writer: Writer<'writer>,
        fields: R,
    ) -> fmt::Result {
        let mut probe = IsEventProbe(false);
        fields.record(&mut probe);
        if probe.0 {
            return self.default.format_fields(writer, fields);
        }

        let mut visitor = LegacyFieldVisitor {
            writer: &mut writer,
            first: true,
            result: Ok(()),
        };
        fields.record(&mut visitor);
        visitor.result
    }
}

/// Detects whether a field set belongs to a log event (which always records a
/// `message` field) rather than a span.
struct IsEventProbe(bool);

impl Visit for IsEventProbe {
    fn record_debug(&mut self, field: &Field, _value: &dyn fmt::Debug) {
        if field.name() == "message" {
            self.0 = true;
        }
    }
}

/// Renders only the legacy console fields, relabelled via [`console_label`].
struct LegacyFieldVisitor<'a, 'writer> {
    writer: &'a mut Writer<'writer>,
    first: bool,
    result: fmt::Result,
}

impl Visit for LegacyFieldVisitor<'_, '_> {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        let Some(label) = console_label(field.name()) else {
            return;
        };
        if self.result.is_err() {
            return;
        }
        let sep = if self.first { "" } else { " " };
        self.result = write!(self.writer, "{sep}{label}={value:?}");
        if self.result.is_ok() {
            self.first = false;
        }
    }
}
