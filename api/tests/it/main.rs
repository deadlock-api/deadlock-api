use std::path::PathBuf;

use axum::ServiceExt;
use axum::extract::Request;
use reqwest::Response;
use testcontainers::runners::AsyncRunner;
use testcontainers::{ContainerAsync, ImageExt};
use testcontainers_modules::clickhouse::ClickHouse;
use testcontainers_modules::minio::MinIO;
use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::redis::Redis;

struct TestEnv {
    base_url: String,
    // Keep container handles alive for the duration of the test suite.
    _postgres: ContainerAsync<Postgres>,
    _redis: ContainerAsync<Redis>,
    _clickhouse: ContainerAsync<ClickHouse>,
    _minio: ContainerAsync<MinIO>,
}

static TEST_ENV: tokio::sync::OnceCell<TestEnv> = tokio::sync::OnceCell::const_new();

fn sorted_sql_files(dir: &str) -> Vec<PathBuf> {
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("failed to read {dir}: {e}"))
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "sql"))
        .collect();
    files.sort();
    files
}

async fn setup() -> &'static TestEnv {
    TEST_ENV
        .get_or_init(|| async {
            let (pg, redis, ch, minio) = tokio::join!(
                Postgres::default()
                    .with_user("root")
                    .with_password("postgres")
                    .with_db_name("root")
                    .with_tag("18")
                    .start(),
                Redis::default().with_tag("alpine").start(),
                ClickHouse::default()
                    .with_tag("25.10")
                    .with_env_var("CLICKHOUSE_PASSWORD", "ijojdmkasd")
                    .with_env_var("CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT", "1")
                    .start(),
                MinIO::default().start(),
            );
            let pg = pg.expect("failed to start postgres");
            let redis = redis.expect("failed to start redis");
            let ch = ch.expect("failed to start clickhouse");
            let minio = minio.expect("failed to start minio");

            let (pg_port, redis_port, ch_http_port, minio_port) = tokio::join!(
                pg.get_host_port_ipv4(5432),
                redis.get_host_port_ipv4(6379),
                ch.get_host_port_ipv4(8123),
                minio.get_host_port_ipv4(9000),
            );
            let pg_port = pg_port.unwrap();
            let redis_port = redis_port.unwrap();
            let ch_http_port = ch_http_port.unwrap();
            let minio_port = minio_port.unwrap();

            // Import test data into Postgres and ClickHouse in parallel.
            let http = reqwest::Client::new();

            let pg_import = async {
                let pg_url = format!("postgres://root:postgres@127.0.0.1:{pg_port}/root");
                let pg_pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&pg_url)
                    .await
                    .expect("failed to connect to postgres");

                for path in &sorted_sql_files("tests/data/postgres") {
                    let sql = std::fs::read_to_string(path)
                        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
                    sqlx::raw_sql(&sql)
                        .execute(&pg_pool)
                        .await
                        .unwrap_or_else(|e| panic!("failed to execute {}: {e}", path.display()));
                }
            };

            let ch_import = async {
                let ch_url = format!("http://127.0.0.1:{ch_http_port}/?user=default&password=ijojdmkasd");
                for path in &sorted_sql_files("tests/data/clickhouse") {
                    let contents = std::fs::read_to_string(path)
                        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
                    // The HTTP API doesn't support multi-statement queries,
                    // so split on `;` and send each statement individually.
                    for stmt in contents.split(';') {
                        let stmt = stmt.trim();
                        if stmt.is_empty() {
                            continue;
                        }
                        let resp = http
                            .post(&ch_url)
                            .body(stmt.to_owned())
                            .send()
                            .await
                            .unwrap_or_else(|e| panic!("failed to post {}: {e}", path.display()));
                        assert!(
                            resp.status().is_success(),
                            "ClickHouse import of {} failed: {}",
                            path.display(),
                            resp.text().await.unwrap_or_default()
                        );
                    }
                }
            };

            tokio::join!(pg_import, ch_import);

            // SAFETY: env vars are set exactly once during OnceCell init, before any
            // concurrent reader (the API router) accesses them.
            let env_vars = [
                ("INTERNAL_API_KEY", "test-internal-api-key".to_owned()),
                ("STEAM_API_KEY", "your_steam_api_key_here".to_owned()),
                ("STEAM_PROXY_URL", "https://127.0.0.1:8989".to_owned()),
                ("STEAM_PROXY_API_KEY", "test-steam-proxy-api-key".to_owned()),
                ("REDIS_URL", format!("redis://127.0.0.1:{redis_port}/0")),
                ("S3_REGION", String::new()),
                ("S3_BUCKET", "test".to_owned()),
                ("S3_ACCESS_KEY_ID", "minioadmin".to_owned()),
                ("S3_SECRET_ACCESS_KEY", "minioadmin".to_owned()),
                ("S3_ENDPOINT", format!("http://127.0.0.1:{minio_port}")),
                ("S3_CACHE_REGION", String::new()),
                ("S3_CACHE_BUCKET", "test-cache".to_owned()),
                ("S3_CACHE_ACCESS_KEY_ID", "minioadmin".to_owned()),
                ("S3_CACHE_SECRET_ACCESS_KEY", "minioadmin".to_owned()),
                ("S3_CACHE_ENDPOINT", format!("http://127.0.0.1:{minio_port}")),
                ("CLICKHOUSE_HOST", "127.0.0.1".to_owned()),
                ("CLICKHOUSE_HTTP_PORT", ch_http_port.to_string()),
                ("CLICKHOUSE_USERNAME", "default".to_owned()),
                ("CLICKHOUSE_PASSWORD", "ijojdmkasd".to_owned()),
                ("CLICKHOUSE_DBNAME", "default".to_owned()),
                ("CLICKHOUSE_RESTRICTED_USERNAME", "api_readonly_user".to_owned()),
                ("CLICKHOUSE_RESTRICTED_PASSWORD", "testing".to_owned()),
                ("POSTGRES_HOST", "127.0.0.1".to_owned()),
                ("POSTGRES_PORT", pg_port.to_string()),
                ("POSTGRES_USERNAME", "root".to_owned()),
                ("POSTGRES_PASSWORD", "postgres".to_owned()),
                ("POSTGRES_DBNAME", "root".to_owned()),
                ("ASSETS_BASE_URL", "https://assets.deadlock-api.com".to_owned()),
                ("PATREON_CLIENT_ID", "your_patreon_client_id".to_owned()),
                ("PATREON_CLIENT_SECRET", "your_patreon_client_secret".to_owned()),
                (
                    "PATREON_REDIRECT_URI",
                    "http://localhost:8080/v1/auth/patreon/callback".to_owned(),
                ),
                (
                    "PATREON_FRONTEND_REDIRECT_URL",
                    "http://localhost:3000/patreon/callback".to_owned(),
                ),
                ("PATREON_CAMPAIGN_ID", "your_patreon_campaign_id".to_owned()),
                ("PATRON_ENCRYPTION_KEY", "your_32_byte_hex_encryption_key".to_owned()),
                ("PATREON_WEBHOOK_SECRET", "whatever-secret".to_owned()),
                ("JWT_SECRET", "your_jwt_secret_at_least_32_chars".to_owned()),
            ];
            for (key, value) in &env_vars {
                unsafe { std::env::set_var(key, value) };
            }

            // Start the API in-process on a random port.
            // The server must run on its own dedicated runtime thread so it
            // survives across individual #[tokio::test] runtimes.
            let std_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .expect("failed to bind listener");
            std_listener.set_nonblocking(true).unwrap();
            let actual_port = std_listener.local_addr().unwrap().port();
            let base_url = format!("http://127.0.0.1:{actual_port}");

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async move {
                    let router = deadlock_api_rust::router(0)
                        .await
                        .expect("failed to build router");
                    let listener = tokio::net::TcpListener::from_std(std_listener).unwrap();
                    let make_service = ServiceExt::<Request>::into_make_service(router);
                    axum::serve(listener, make_service).await.unwrap();
                });
            });

            // Wait for the health endpoint to respond.
            let health_url = format!("{base_url}/v1/info/health");
            let mut healthy = false;
            for _ in 0..60 {
                if http.get(&health_url).send().await.is_ok_and(|r| r.status().is_success()) {
                    healthy = true;
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
            assert!(healthy, "server did not become healthy within 15s");

            TestEnv {
                base_url,
                _postgres: pg,
                _redis: redis,
                _clickhouse: ch,
                _minio: minio,
            }
        })
        .await
}

/// Check the response for common errors
///
/// # Panics
///
/// Panics if the response is not OK
pub fn check_response(response: &Response) {
    assert_eq!(
        response.status(),
        reqwest::StatusCode::OK,
        "Status code is not 200"
    );
}

fn stringify<'a>(query: &[(&'a str, &'a str)]) -> String {
    query.iter().fold(String::new(), |acc, &tuple| {
        acc + tuple.0 + "=" + tuple.1 + "&"
    })
}

/// Request an endpoint and check the response
///
/// # Panics
///
/// Panics if the request fails or the response is not OK
pub async fn request_endpoint(
    endpoint: &str,
    query_args: impl IntoIterator<Item = (&str, &str)>,
) -> Response {
    let env = setup().await;
    let mut url = format!("{}{endpoint}", env.base_url);

    let query_args = query_args
        .into_iter()
        .chain([("api_key", "HEXE-fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64")])
        .collect::<Vec<_>>();
    let query = stringify(&query_args);
    if !query.is_empty() {
        url = format!("{url}?{query}");
    }
    let response = reqwest::get(url).await.expect("Failed to get response");
    check_response(&response);
    response
}

/// Append a query parameter to a `Vec<(&str, String)>`.
///
/// Supports three forms:
/// - `push_query!(q, "key" => expr)` -- always included, calls `.to_string()`
/// - `push_query!(q, "key" =>? opt_expr)` -- included only if `Some`, calls `.to_string()`
/// - `push_query!(q, "key" =>[] opt_vec_expr)` -- included only if `Some`, joins elements with commas
#[macro_export]
macro_rules! push_query {
    ($queries:ident, $key:expr => $val:expr) => {
        $queries.push(($key, $val.to_string()));
    };
    ($queries:ident, $key:expr =>? $val:expr) => {
        if let Some(ref __v) = $val {
            $queries.push(($key, __v.to_string()));
        }
    };
    ($queries:ident, $key:expr =>[] $val:expr) => {
        if let Some(ref __v) = $val {
            $queries.push((
                $key,
                __v.iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(","),
            ));
        }
    };
}

/// Convert owned query params to borrowed refs for `request_endpoint`.
pub fn query_refs<'a>(params: &'a [(&'a str, String)]) -> Vec<(&'a str, &'a str)> {
    params.iter().map(|(k, v)| (*k, v.as_str())).collect()
}

mod analytics;
mod builds;
mod info;
mod patches;
mod player;
mod sql;
