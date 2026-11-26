//! Execution of queries that return data.

use crate::error::{Error, Result};
use crate::native::reader::WireFormat;
use crate::native::{Block, block_encoder, to_row_binary};
use crate::query_summary::QuerySummary;
use crate::response::{Chunk, Chunks, Response};
use crate::tcp::connection::{
    Connection, ProfileInfo, Progress, QueryPacket, ServerCompression, ServerPacket,
};
use crate::tcp::pool::{Pool, PooledConnection};
use crate::tcp::profile_events::ProfileEvents;
use crate::tcp::protocol::ClientInfo;
use crate::tcp::{
    Request, RowFormat, changes_session, leading_words, params, skip_whitespace_and_comments,
    trailing_format,
};
use crate::{Client, Compression};
use bytes::BytesMut;
use core::pin::Pin;
use core::time::Duration;
use std::borrow::Cow;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

/// The number of converted chunks that the query task sends ahead of the cursor.
const CHANNEL_CAPACITY: usize = 4;

/// How long to wait for the end of a canceled query before the connection is closed.
const CANCEL_TIMEOUT: Duration = Duration::from_secs(5);

/// The format that the cursor reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Output {
    /// The result is not read (`Query::execute()`).
    Discard,
    RowBinary {
        names: bool,
        types: bool,
    },
    Native,
    /// A text format with one line per row, formatted by the server with `formatRow()`
    /// (see [`format_rows_query()`]).
    Text(&'static str),
}

/// The text formats with one line per row and no header or footer.
///
/// The server formats the rows with `formatRow()`, which gives the same lines as the format.
const TEXT_FORMATS: &[&str] = &[
    "JSONEachRow",
    "JSONLines",
    "NDJSON",
    "JSONStringsEachRow",
    "JSONCompactEachRow",
    "JSONCompactStringsEachRow",
    "CSV",
    "TabSeparated",
    "TSV",
    "TabSeparatedRaw",
    "TSVRaw",
    "Raw",
    "LineAsString",
];

/// The text formats that `output_format_json_array_of_rows = 1` changes: the rows are written
/// as a JSON array, with `[`, `]` and commas that `formatRow()` does not write.
const JSON_ARRAY_FORMATS: &[&str] = &["JSONEachRow", "JSONLines", "NDJSON", "JSONStringsEachRow"];

impl Output {
    pub(crate) fn new(format: Option<&str>, sql: &str) -> Result<Self> {
        let Some(format) = format else {
            return Ok(Self::Discard);
        };

        // Like the HTTP interface, a `FORMAT` clause overrides the default format.
        let name = trailing_format(sql).unwrap_or(format);

        match RowFormat::from_name(name) {
            Some(RowFormat::RowBinary { names, types }) => Ok(Self::RowBinary { names, types }),
            Some(RowFormat::Native) => Ok(Self::Native),
            None => TEXT_FORMATS.iter().find(|text| **text == name).map_or_else(
                || {
                    Err(Error::Unsupported(format!(
                        "format {name} is not supported by the native TCP transport; \
                         supported formats: Native, RowBinary, RowBinaryWithNames, \
                         RowBinaryWithNamesAndTypes, {}",
                        TEXT_FORMATS.join(", ")
                    )))
                },
                |text| Ok(Self::Text(text)),
            ),
        }
    }

    fn write_header(self, block: &Block, out: &mut BytesMut) -> Result<()> {
        match self {
            Self::RowBinary { names: true, types } => {
                to_row_binary::write_names_and_types(block, types, out)
            }
            _ => Ok(()),
        }
    }

    /// `server_format` is the format of the server: the `Native` output is the same as the
    /// output of the server's `Native` format.
    fn write_rows(
        self,
        block: &Block,
        server_format: WireFormat,
        out: &mut BytesMut,
    ) -> Result<()> {
        if block.num_rows() == 0 {
            return Ok(());
        }

        match self {
            Self::Discard => Ok(()),
            Self::RowBinary { .. } => to_row_binary::write_rows(block, out),
            Self::Text(_) => {
                // Each value of `formatRow()` is one row with its line break.
                let lines = match block.columns() {
                    [column] => column.string_data(),
                    _ => None,
                };
                let lines = lines.ok_or_else(|| {
                    Error::BadResponse("expected one String column of formatted rows".into())
                })?;
                out.extend_from_slice(lines);
                Ok(())
            }
            Self::Native => block_encoder::write_block(
                block,
                WireFormat {
                    revision: 0,
                    ..server_format
                },
                out,
            ),
        }
    }
}

/// Execute a query, returning a response with the data in `format`.
pub(crate) fn query(client: &Client, sql: String, format: Option<&str>) -> Result<Response> {
    let output = Output::new(format, &sql)?;
    let mut request = Request::new(client)?;

    let sql = match output {
        Output::Text(format) => {
            if JSON_ARRAY_FORMATS.contains(&format)
                && request
                    .setting("output_format_json_array_of_rows")
                    .is_some_and(|value| value == "1")
            {
                return Err(Error::Unsupported(format!(
                    "format {format} with output_format_json_array_of_rows = 1 is not supported \
                     by the native TCP transport"
                )));
            }

            if !is_subquery(sql.as_bytes()) {
                return Err(Error::Unsupported(format!(
                    "format {format} is supported by the native TCP transport only for \
                     SELECT, WITH and EXPLAIN queries"
                )));
            }

            format_rows_query(format, &sql)
        }
        _ => sql,
    };

    if matches!(output, Output::RowBinary { .. })
        && request
            .setting("output_format_binary_write_json_as_string")
            .is_some_and(|value| value == "1")
    {
        // The native protocol sends JSON in its binary serialization by default,
        // which cannot be converted to the strings of `RowBinary`.
        request.add_setting("output_format_native_write_json_as_string", "1");
    }

    let (final_summary_tx, final_summary_rx) = oneshot::channel();
    let started = start(
        client,
        request,
        sql,
        BytesConverter {
            output,
            received_header: false,
            capacity: 0,
        },
        Some(final_summary_tx),
    );

    Ok(Response::Waiting(Box::pin(async move {
        let (receiver, summary) = started.await?;
        Ok((Chunks::from_receiver(receiver, final_summary_rx), summary))
    })))
}

/// The query that returns the rows of `sql` in a text `format`, one `String` value per row.
///
/// The server formats the rows with its own code and the settings of the query, as it does for
/// the HTTP interface. A trailing `FORMAT` clause and `;` are removed. A trailing top-level
/// `SETTINGS` clause moves after the subquery, so that its settings (e.g. `output_format_*` or
/// `log_comment`) apply to the whole query, `formatRow()` included, as with the HTTP interface.
/// The line breaks around the subquery end a trailing `--` comment. With only `LowCardinality`
/// columns, `formatRow()` returns `LowCardinality(String)`, hence the `CAST`.
fn format_rows_query(format: &str, sql: &str) -> String {
    match split_settings_clause(strip_format_clause(sql)) {
        (inner, Some(settings)) => format!(
            "SELECT CAST(formatRow('{format}', *) AS String) FROM (\n{inner}\n) SETTINGS {settings}"
        ),
        (inner, None) => {
            format!("SELECT CAST(formatRow('{format}', *) AS String) FROM (\n{inner}\n)")
        }
    }
}

/// Splits a trailing top-level `SETTINGS <name> = <value>, ...` clause off the SQL: the SQL before
/// the clause and the settings after the keyword.
///
/// `SETTINGS` in strings, quoted identifiers, comments and parentheses (subqueries, CTEs) is
/// skipped, and so is a `settings` word that is not followed by `<name> =`.
fn split_settings_clause(sql: &str) -> (&str, Option<&str>) {
    const KEYWORD: &[u8] = b"SETTINGS";

    let bytes = sql.as_bytes();
    let mut depth = 0_usize;
    let mut index = 0_usize;
    let mut last = None;

    while let Some(&byte) = bytes.get(index) {
        let rest = bytes.get(index..).unwrap_or_default();

        let comment = params::comment_len(rest);
        if comment > 0 {
            index = index.saturating_add(comment);
            continue;
        }

        match byte {
            b'\'' | b'"' | b'`' => {
                index = index.saturating_add(quoted_len(rest, byte));
                continue;
            }
            b'(' | b'[' => depth = depth.saturating_add(1),
            b')' | b']' => depth = depth.saturating_sub(1),
            _ if depth == 0 && is_keyword_at(bytes, index, KEYWORD) => last = Some(index),
            _ => {}
        }

        index = index.saturating_add(1);
    }

    let Some(start) = last else {
        return (sql, None);
    };

    let (Some(before), Some(after)) = (
        sql.get(..start),
        sql.get(start.saturating_add(KEYWORD.len())..),
    ) else {
        return (sql, None);
    };

    let settings = after.trim();
    let starts_with_name = settings.split_once('=').is_some_and(|(name, _)| {
        let name = name.trim();
        !name.is_empty() && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    });

    if starts_with_name {
        (before.trim_end(), Some(settings))
    } else {
        (sql, None)
    }
}

/// The length of the quoted string or identifier at the start of `input`, quotes included.
/// Quotes are escaped with a backslash or by doubling them.
fn quoted_len(input: &[u8], quote: u8) -> usize {
    let mut index = 1_usize;

    while let Some(&byte) = input.get(index) {
        if byte == b'\\' {
            index = index.saturating_add(2);
        } else if byte != quote {
            index = index.saturating_add(1);
        } else if input.get(index.saturating_add(1)) == Some(&quote) {
            index = index.saturating_add(2);
        } else {
            return index.saturating_add(1);
        }
    }

    input.len()
}

/// Returns `true` if `keyword` (case-insensitive) is a whole word at `index` of `sql`.
fn is_keyword_at(sql: &[u8], index: usize, keyword: &[u8]) -> bool {
    let is_word_byte = |byte: &u8| byte.is_ascii_alphanumeric() || *byte == b'_';
    let end = index.saturating_add(keyword.len());

    let starts_word = index
        .checked_sub(1)
        .and_then(|before| sql.get(before))
        .is_none_or(|byte| !is_word_byte(byte));

    starts_word
        && sql
            .get(index..end)
            .is_some_and(|word| word.eq_ignore_ascii_case(keyword))
        && sql.get(end).is_none_or(|byte| !is_word_byte(byte))
}

/// Returns `true` if the statement can be a subquery: `SELECT`, `WITH`, `EXPLAIN` or a
/// statement in parentheses. `SHOW`, `DESCRIBE`, `EXISTS` and others cannot.
fn is_subquery(sql: &[u8]) -> bool {
    if skip_whitespace_and_comments(sql).starts_with(b"(") {
        return true;
    }

    leading_words(sql, 1).first().is_some_and(|word| {
        [&b"SELECT"[..], b"WITH", b"EXPLAIN"]
            .iter()
            .any(|keyword| word.eq_ignore_ascii_case(keyword))
    })
}

/// The SQL without a trailing `FORMAT <name>` clause and `;`.
fn strip_format_clause(sql: &str) -> &str {
    let sql = sql.trim_end().trim_end_matches(';').trim_end();

    let Some(rest) = trailing_format(sql).and_then(|name| sql.strip_suffix(name)) else {
        return sql;
    };

    // `trailing_format()` checked that the keyword before the name is `FORMAT`.
    let rest = rest.trim_end();
    rest.get(..rest.len().saturating_sub("FORMAT".len()))
        .unwrap_or(rest)
        .trim_end()
}

/// The blocks of a query result, once the query has started.
pub(crate) type BlocksFuture =
    Pin<Box<dyn Future<Output = Result<mpsc::Receiver<Result<Block>>>> + Send>>;

/// Execute a query, returning the blocks of the result (`Query::fetch_native()`).
pub(crate) fn query_blocks(client: &Client, sql: String) -> Result<BlocksFuture> {
    let started = start(client, Request::new(client)?, sql, BlockConverter, None);
    Ok(Box::pin(async move { Ok(started.await?.0) }))
}

/// Run the query in a task when the returned future is polled; the future completes
/// when the result starts.
fn start<C: Converter>(
    client: &Client,
    request: Request,
    sql: String,
    converter: C,
    final_summary_tx: Option<oneshot::Sender<QuerySummary>>,
) -> impl Future<Output = Result<(mpsc::Receiver<Result<C::Item>>, HeaderSummary)>> + Send + use<C>
{
    let pool = Arc::clone(&client.tcp);
    let (header_tx, header_rx) = oneshot::channel();
    let (item_tx, item_rx) = mpsc::channel(CHANNEL_CAPACITY);

    async move {
        let mut sink = Sink::new(header_tx, item_tx);
        sink.final_summary_tx = final_summary_tx;
        tokio::spawn(run(pool, request, sql, converter, sink));

        match header_rx.await {
            Ok(Ok(summary)) => Ok((item_rx, summary)),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(Error::Network("the query task stopped unexpectedly".into())),
        }
    }
}

/// Converts the blocks of the result to the items that the cursor reads.
trait Converter: Send + 'static {
    type Item: Send + 'static;

    /// Convert a block; `None` if there is nothing to send.
    fn convert(
        &mut self,
        block: Block,
        conn: &Connection,
        net_size: usize,
    ) -> Result<Option<Self::Item>>;
}

/// Converts blocks to bytes in the format that the cursor reads.
struct BytesConverter {
    output: Output,
    received_header: bool,
    /// The size of the previous chunk, to allocate the next one.
    capacity: usize,
}

impl Converter for BytesConverter {
    type Item = Chunk;

    fn convert(
        &mut self,
        block: Block,
        conn: &Connection,
        net_size: usize,
    ) -> Result<Option<Chunk>> {
        let mut data = BytesMut::with_capacity(self.capacity);

        if !core::mem::replace(&mut self.received_header, true) {
            self.output.write_header(&block, &mut data)?;
        }

        self.output
            .write_rows(&block, conn.wire_format(), &mut data)?;
        self.capacity = data.len();

        Ok((!data.is_empty()).then(|| Chunk {
            data: data.freeze(),
            net_size,
        }))
    }
}

/// Passes blocks with rows to the cursor.
struct BlockConverter;

impl Converter for BlockConverter {
    type Item = Block;

    fn convert(&mut self, block: Block, _: &Connection, _: usize) -> Result<Option<Block>> {
        Ok((block.num_rows() > 0).then_some(block))
    }
}

type HeaderSummary = Option<Box<QuerySummary>>;

/// Delivers the response to the cursor.
struct Sink<T> {
    header_tx: Option<oneshot::Sender<Result<HeaderSummary>>>,
    /// Receives the summary at the end of a successful response.
    final_summary_tx: Option<oneshot::Sender<QuerySummary>>,
    chunk_tx: mpsc::Sender<Result<T>>,
    /// The response is collected before it is sent (`wait_end_of_query = 1`).
    buffer: Option<Vec<T>>,
}

impl<T> Sink<T> {
    const fn new(
        header_tx: oneshot::Sender<Result<HeaderSummary>>,
        chunk_tx: mpsc::Sender<Result<T>>,
    ) -> Self {
        Self {
            header_tx: Some(header_tx),
            final_summary_tx: None,
            chunk_tx,
            buffer: None,
        }
    }

    /// Send the start of the response, if not sent yet.
    fn start(&mut self, summary: QuerySummary) {
        if self.buffer.is_none()
            && let Some(header_tx) = self.header_tx.take()
        {
            // The cursor may be dropped already.
            drop(header_tx.send(Ok(Some(Box::new(summary)))));
        }
    }

    /// Returns `false` if the cursor is dropped.
    async fn send(&mut self, chunk: T) -> bool {
        match &mut self.buffer {
            Some(buffer) => {
                buffer.push(chunk);
                true
            }
            None => self.chunk_tx.send(Ok(chunk)).await.is_ok(),
        }
    }

    /// Send the end of a successful response.
    async fn finish(mut self, summary: QuerySummary) {
        if let Some(final_summary_tx) = self.final_summary_tx.take() {
            // Before the end of the data, so that the cursor has it at the end.
            drop(final_summary_tx.send(summary.clone()));
        }

        let buffer = self.buffer.take();
        self.start(summary);

        for chunk in buffer.into_iter().flatten() {
            if self.chunk_tx.send(Ok(chunk)).await.is_err() {
                return;
            }
        }
    }

    async fn fail(mut self, error: Error) {
        match self.header_tx.take() {
            Some(header_tx) => {
                drop(header_tx.send(Err(error)));
            }
            None => {
                drop(self.chunk_tx.send(Err(error)).await);
            }
        }
    }
}

enum Outcome {
    Completed {
        summary: QuerySummary,
    },
    /// The cursor was dropped before the end of the response.
    Canceled {
        compression: Compression,
    },
}

/// An error and whether the connection can be used again.
pub(crate) struct Failure {
    pub(crate) error: Error,
    pub(crate) reusable: bool,
}

impl Failure {
    /// An error after which the connection is in an unknown state.
    pub(crate) const fn broken(error: Error) -> Self {
        Self {
            error,
            reusable: false,
        }
    }

    /// An error after which the connection can be used again, e.g. an exception of the server.
    pub(crate) const fn reusable(error: Error) -> Self {
        Self {
            error,
            reusable: true,
        }
    }
}

async fn run<C: Converter>(
    pool: Arc<Pool>,
    request: Request,
    sql: String,
    mut converter: C,
    mut sink: Sink<C::Item>,
) {
    if request.wait_end_of_query {
        sink.buffer = Some(Vec::new());
    }

    let mut pooled = match pool.acquire(&request.key, request.session.clone()).await {
        Ok(pooled) => pooled,
        Err(e) => return sink.fail(e).await,
    };

    let result = match pooled.conn() {
        Ok(conn) => execute(conn, &request, sql.as_bytes(), &mut converter, &mut sink).await,
        Err(e) => Err(Failure::broken(e)),
    };

    let keeps_session = request.session.is_some();
    let stateless = keeps_session || !changes_session(sql.as_bytes());

    match result {
        Ok(Outcome::Completed { summary }) => {
            pooled.release(stateless);
            sink.finish(summary).await;
        }
        Ok(Outcome::Canceled { compression }) => {
            let reusable = cancel(&mut pooled, compression).await;
            pooled.release(reusable && stateless);
        }
        Err(failure) => {
            pooled.release(failure.reusable && stateless);
            sink.fail(failure.error).await;
        }
    }
}

/// Send the `Query` packet and the empty block of external tables.
///
/// Returns the compression of the query, which can differ from the compression of the request.
pub(crate) async fn send_query(
    conn: &mut Connection,
    request: &Request,
    sql: &[u8],
) -> Result<Compression, Failure> {
    set_roles(conn, &request.roles).await?;

    let (compression, compression_settings) = negotiate_compression(conn, request).await?;

    let settings: Vec<(&str, &str)> = request
        .settings
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .chain(
            compression_settings
                .iter()
                .map(|(name, value)| (*name, value.as_str())),
        )
        .collect();

    let (sql, renamed) = parameters(conn, request, sql);
    let parameters: Vec<(&str, &str)> = renamed
        .iter()
        .map(|(name, value)| (name.as_ref(), *value))
        .collect();

    write_query(
        conn,
        &QueryPacket {
            query_id: &request.query_id,
            client_info: ClientInfo {
                client_name: &request.key.client_name,
                quota_key: &request.key.quota_key,
                #[cfg(feature = "opentelemetry")]
                trace_context: request.trace_context.clone(),
            },
            settings: &settings,
            query: &sql,
            parameters: &parameters,
            compression,
        },
    )
    .await?;

    Ok(compression)
}

/// Write a `Query` packet and the empty block of external tables, and flush.
async fn write_query(conn: &mut Connection, packet: &QueryPacket<'_>) -> Result<(), Failure> {
    // Nothing was sent yet if the packet is invalid.
    conn.write_query(packet).map_err(Failure::reusable)?;
    send_end_of_data(conn, packet.compression).await
}

/// Send the empty block that ends the data.
pub(crate) async fn send_end_of_data(
    conn: &mut Connection,
    compression: Compression,
) -> Result<(), Failure> {
    conn.write_data(None, compression)
        .map_err(Failure::broken)?;
    conn.flush().await.map_err(Failure::broken)
}

/// A query without settings, parameters and compression for the internal queries of the client.
const fn internal_query(sql: &str) -> QueryPacket<'_> {
    QueryPacket {
        query_id: "",
        client_info: ClientInfo {
            client_name: "",
            quota_key: "",
            #[cfg(feature = "opentelemetry")]
            trace_context: None,
        },
        settings: &[],
        query: sql.as_bytes(),
        parameters: &[],
        compression: Compression::None,
    }
}

/// Query parameters as `(name, value)` pairs.
type Parameters<'a> = Vec<(Cow<'a, str>, &'a str)>;

/// The query and the query parameters to send.
///
/// Servers before 26.7 read parameters as settings, so a parameter with the name of a setting
/// (for example `limit`) fails. For these servers, the parameters are renamed in the query.
fn parameters<'a>(
    conn: &Connection,
    request: &'a Request,
    sql: &'a [u8],
) -> (Cow<'a, [u8]>, Parameters<'a>) {
    if request.parameters.is_empty() || conn.server().version_at_least(26, 7) {
        let parameters = request
            .parameters
            .iter()
            .map(|(name, value)| (Cow::Borrowed(name.as_str()), value.as_str()))
            .collect();
        return (Cow::Borrowed(sql), parameters);
    }

    let names: Vec<&str> = request
        .parameters
        .iter()
        .map(|(name, _)| name.as_str())
        .collect();
    let parameters = request
        .parameters
        .iter()
        .map(|(name, value)| {
            (
                Cow::Owned(format!("{}{name}", params::PREFIX)),
                value.as_str(),
            )
        })
        .collect();

    (
        Cow::Owned(params::rename_parameters(sql, &names)),
        parameters,
    )
}

/// The method of `compression`: the name and the ZSTD level, or `None` if compression is disabled.
#[cfg_attr(
    not(feature = "zstd"),
    expect(
        clippy::missing_const_for_fn,
        reason = "`i64::from` in the ZSTD arm is not const"
    )
)]
fn method(compression: Compression) -> Option<(&'static str, Option<i64>)> {
    match compression {
        Compression::None => None,
        #[cfg(feature = "lz4")]
        #[expect(
            deprecated,
            reason = "`Lz4Hc` is still accepted and compresses like `Lz4`"
        )]
        Compression::Lz4 | Compression::Lz4Hc(_) => Some(("LZ4", None)),
        #[cfg(feature = "zstd")]
        Compression::Zstd(level) => Some(("ZSTD", Some(i64::from(level)))),
    }
}

/// Select the compression of a query and the settings that request it.
///
/// The server compresses data with its `network_compression_method`. If the method of the client
/// is different, it is requested. A user with `readonly = 1` cannot change settings: then the method
/// of the server is used if this build can decompress it, else the query is not compressed.
async fn negotiate_compression(
    conn: &mut Connection,
    request: &Request,
) -> Result<(Compression, Vec<(&'static str, String)>), Failure> {
    let Some((method, level)) = method(request.compression) else {
        return Ok((Compression::None, Vec::new()));
    };

    if request.setting("network_compression_method").is_some() {
        // The user selected the method.
        return Ok((request.compression, Vec::new()));
    }

    let server = server_compression(conn).await?;

    let same_method = server.method.eq_ignore_ascii_case(method)
        && (level.is_none() || level == Some(server.zstd_level));

    if same_method {
        return Ok((request.compression, Vec::new()));
    }

    if !server.readonly {
        let mut settings = vec![("network_compression_method", method.to_owned())];

        if let Some(level) = level {
            settings.push(("network_zstd_compression_level", level.to_string()));
        }

        return Ok((request.compression, settings));
    }

    if server.can_decompress() {
        Ok((request.compression, Vec::new()))
    } else {
        Ok((Compression::None, Vec::new()))
    }
}

/// Get the compression settings of the server for the user of the connection.
///
/// The pool keeps the result for the server and the user.
async fn server_compression(conn: &mut Connection) -> Result<ServerCompression, Failure> {
    if let Some(known) = &conn.server_compression {
        return Ok(known.clone());
    }

    write_query(
        conn,
        &internal_query(
            "SELECT toUInt64(getSetting('readonly')), \
             toString(getSetting('network_compression_method')), \
             toInt64(getSetting('network_zstd_compression_level'))",
        ),
    )
    .await?;

    let mut result = None;

    loop {
        match conn.read_packet(false).await.map_err(Failure::broken)? {
            ServerPacket::Data(block) if block.num_rows() > 0 => {
                result = ServerCompression::from_block(&block);
            }
            ServerPacket::EndOfStream => break,
            ServerPacket::Exception(error) => return Err(Failure::reusable(error)),
            _ => {}
        }
    }

    let known = result.ok_or_else(|| {
        Failure::broken(Error::BadResponse(
            "the server did not return its compression settings".into(),
        ))
    })?;

    conn.server_compression = Some(known.clone());
    Ok(known)
}

/// Make the roles of the session of `conn` match `roles`.
async fn set_roles(conn: &mut Connection, roles: &[String]) -> Result<(), Failure> {
    if conn.roles == roles {
        return Ok(());
    }

    let mut sql = String::from("SET ROLE ");

    if roles.is_empty() {
        sql.push_str("DEFAULT");
    } else {
        for (index, role) in roles.iter().enumerate() {
            if index > 0 {
                sql.push_str(", ");
            }

            crate::sql::escape::identifier(role, &mut sql)
                .map_err(|e| Failure::broken(Error::Other(e.to_string().into())))?;
        }
    }

    write_query(conn, &internal_query(&sql)).await?;
    drain(conn, Compression::None, None).await?;

    conn.roles = roles.to_vec();
    Ok(())
}

/// Detects that the server waits for the data of an `INSERT`.
#[derive(Default)]
pub(crate) struct DataRequest {
    table_columns: bool,
    answered: bool,
}

impl DataRequest {
    /// Returns `true` once if `packet` is the request of the server for the data of an `INSERT`.
    ///
    /// The server sends the structure of the table as a block without rows. Before it,
    /// the server sends the columns of the table, unless `input_format_defaults_for_omitted_fields`
    /// is disabled. Since 22.8 (or earlier), the server sends a block for an `INSERT` only when
    /// it waits for the data; older servers also send blocks for `INSERT` with inline data.
    pub(crate) fn check(&mut self, packet: &ServerPacket, conn: &Connection, sql: &[u8]) -> bool {
        match packet {
            ServerPacket::TableColumns => {
                self.table_columns = true;
                false
            }
            ServerPacket::Data(_) if !self.answered => {
                let is_insert = leading_words(sql, 1)
                    .first()
                    .is_some_and(|word| word.eq_ignore_ascii_case(b"INSERT"));

                self.answered = true;
                self.table_columns || (is_insert && conn.server().version_at_least(22, 8))
            }
            _ => false,
        }
    }
}

/// Read the packets of a query that returns no data, until the end.
///
/// If the server waits for the data of an `INSERT` in `sql`, the end of data is sent.
pub(crate) async fn drain(
    conn: &mut Connection,
    compression: Compression,
    sql: Option<&[u8]>,
) -> Result<Progress, Failure> {
    let mut progress = Progress::default();
    let mut data_request = DataRequest::default();

    loop {
        let packet = conn
            .read_packet(compression.is_enabled())
            .await
            .map_err(Failure::broken)?;

        if let Some(sql) = sql
            && data_request.check(&packet, conn, sql)
        {
            send_end_of_data(conn, compression).await?;
            continue;
        }

        match packet {
            ServerPacket::EndOfStream => return Ok(progress),
            ServerPacket::Exception(error) => {
                return Err(Failure::reusable(error));
            }
            ServerPacket::Progress(increment) => progress.add(&increment),
            _ => {}
        }
    }
}

async fn execute<C: Converter>(
    conn: &mut Connection,
    request: &Request,
    sql: &[u8],
    converter: &mut C,
    sink: &mut Sink<C::Item>,
) -> Result<Outcome, Failure> {
    let compression = send_query(conn, request, sql).await?;

    let compressed = compression.is_enabled();
    let mut data_request = DataRequest::default();

    let mut progress = Progress::default();
    let mut profile: Option<ProfileInfo> = None;
    let mut events = ProfileEvents::default();
    let mut received_header = false;
    let mut received_bytes = conn.received_bytes();

    loop {
        let packet = conn
            .read_packet(compressed)
            .await
            .map_err(Failure::broken)?;

        if data_request.check(&packet, conn, sql) {
            // The HTTP interface inserts the empty request body.
            send_end_of_data(conn, compression).await?;
            continue;
        }

        let block = match packet {
            ServerPacket::Data(block) => block,
            ServerPacket::Progress(increment) => {
                progress.add(&increment);
                continue;
            }
            ServerPacket::ProfileInfo(info) => {
                profile = Some(info);
                continue;
            }
            ServerPacket::ProfileEvents(block) => {
                events.add(&block);
                continue;
            }
            ServerPacket::EndOfStream => {
                return Ok(Outcome::Completed {
                    summary: progress.to_summary(profile.as_ref(), &events),
                });
            }
            ServerPacket::Exception(error) => {
                return Err(Failure::reusable(error));
            }
            ServerPacket::Pong | ServerPacket::Other | ServerPacket::TableColumns => continue,
        };

        if !received_header {
            received_header = true;
            sink.start(progress.to_summary(profile.as_ref(), &events));
        }

        let total_received = conn.received_bytes();
        let net_size =
            usize::try_from(total_received.saturating_sub(received_bytes)).unwrap_or(usize::MAX);
        received_bytes = total_received;

        let Some(item) = converter
            .convert(block, conn, net_size)
            .map_err(Failure::broken)?
        else {
            continue;
        };

        if !sink.send(item).await {
            return Ok(Outcome::Canceled { compression });
        }
    }
}

/// Cancel the query and read the rest of the response.
///
/// Returns `true` if the connection can be used again.
async fn cancel(pooled: &mut PooledConnection, compression: Compression) -> bool {
    let Ok(conn) = pooled.conn() else {
        return false;
    };

    conn.write_cancel();

    let finished = async {
        conn.flush().await.ok()?;

        loop {
            match conn.read_packet(compression.is_enabled()).await.ok()? {
                ServerPacket::EndOfStream | ServerPacket::Exception(_) => return Some(()),
                _ => {}
            }
        }
    };

    matches!(
        tokio::time::timeout(CANCEL_TIMEOUT, finished).await,
        Ok(Some(()))
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::assert_matches;

    #[test]
    fn text_formats() {
        assert_eq!(
            Output::new(Some("JSONEachRow"), "SELECT 1").ok(),
            Some(Output::Text("JSONEachRow"))
        );
        // A `FORMAT` clause overrides the default format.
        assert_eq!(
            Output::new(Some("RowBinary"), "SELECT 1 FORMAT CSV").ok(),
            Some(Output::Text("CSV"))
        );

        for format in ["CSVWithNames", "JSON", "Parquet", "Arrow", "jsoneachrow"] {
            assert_matches!(
                Output::new(Some(format), "SELECT 1"),
                Err(Error::Unsupported(_)),
                "{format}"
            );
        }
    }

    #[test]
    fn strips_format_clause() {
        assert_eq!(strip_format_clause("SELECT 1"), "SELECT 1");
        assert_eq!(strip_format_clause("SELECT 1;\n"), "SELECT 1");
        assert_eq!(
            strip_format_clause("SELECT 1 FORMAT JSONEachRow"),
            "SELECT 1"
        );
        assert_eq!(strip_format_clause("select 1\nformat CSV ;"), "select 1");
        assert_eq!(strip_format_clause("SELECT (1)FORMAT TSV"), "SELECT (1)");
        assert_eq!(
            strip_format_clause("SELECT 1 SETTINGS max_threads = 1"),
            "SELECT 1 SETTINGS max_threads = 1"
        );
        assert_eq!(
            strip_format_clause("SELECT 'FORMAT x'"),
            "SELECT 'FORMAT x'"
        );
    }

    #[test]
    fn wraps_query() {
        assert_eq!(
            format_rows_query("CSV", "SELECT 1 -- comment\nFORMAT TSV;"),
            "SELECT CAST(formatRow('CSV', *) AS String) FROM (\nSELECT 1 -- comment\n)"
        );
    }

    #[test]
    fn hoists_settings_clause() {
        assert_eq!(
            format_rows_query(
                "JSONEachRow",
                "SELECT a FROM t SETTINGS log_comment = 'x', output_format_json_skip_null_value_in_named_tuples = 1"
            ),
            "SELECT CAST(formatRow('JSONEachRow', *) AS String) FROM (\nSELECT a FROM t\n) \
             SETTINGS log_comment = 'x', output_format_json_skip_null_value_in_named_tuples = 1"
        );

        let split = |sql| split_settings_clause(sql);
        assert_eq!(split("SELECT 1"), ("SELECT 1", None));
        assert_eq!(
            split("select 1 settings max_threads=1"),
            ("select 1", Some("max_threads=1"))
        );
        // Only the trailing top-level clause.
        assert_eq!(
            split("SELECT * FROM (SELECT 1 SETTINGS max_threads = 1) SETTINGS log_comment = 'a'"),
            (
                "SELECT * FROM (SELECT 1 SETTINGS max_threads = 1)",
                Some("log_comment = 'a'")
            )
        );
        assert_eq!(
            split("SELECT * FROM (SELECT 1 SETTINGS max_threads = 1)"),
            ("SELECT * FROM (SELECT 1 SETTINGS max_threads = 1)", None)
        );
        // Not a clause: strings, identifiers, comments, a column named `settings`.
        for sql in [
            "SELECT 'SETTINGS a = 1'",
            "SELECT \"SETTINGS\" FROM t WHERE x = 1",
            "SELECT `settings` FROM t WHERE x = 1",
            "SELECT 1 -- SETTINGS a = 1",
            "SELECT 1 /* SETTINGS a = 1 */",
            "SELECT settings FROM t WHERE a = 1",
            "SELECT my_settings = 1",
            "SELECT 'it''s SETTINGS a = 1'",
        ] {
            assert_eq!(split(sql), (sql, None), "{sql}");
        }
        assert_eq!(
            split("SELECT 'a\\'b' SETTINGS log_comment = 'c'"),
            ("SELECT 'a\\'b'", Some("log_comment = 'c'"))
        );
        // A comment after the settings stays with them, at the end of the query.
        assert_eq!(
            split("SELECT 1 SETTINGS max_threads = 1 -- c"),
            ("SELECT 1", Some("max_threads = 1 -- c"))
        );
    }

    #[test]
    fn subqueries() {
        for sql in [
            "SELECT 1",
            "  with t AS (SELECT 1) SELECT * FROM t",
            "-- comment\nEXPLAIN SELECT 1",
            "/* comment */ (SELECT 1)",
        ] {
            assert!(is_subquery(sql.as_bytes()), "{sql}");
        }

        for sql in [
            "SHOW TABLES",
            "DESCRIBE t",
            "EXISTS t",
            "INSERT INTO t SELECT 1",
            "",
        ] {
            assert!(!is_subquery(sql.as_bytes()), "{sql}");
        }
    }
}
