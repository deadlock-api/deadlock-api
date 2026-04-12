use reqwest::Response;

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
    let mut url = format!("http://localhost:3000{endpoint}");

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
            $queries.push(($key, __v.iter().map(ToString::to_string).collect::<Vec<_>>().join(",")));
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
