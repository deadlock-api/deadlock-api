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
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .unwrap(),
        "*"
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
        .chain([("api_key", "HEXE-7477ea31-4cc7-42b2-b732-acb55c0d3371")].into_iter())
        .collect::<Vec<_>>();
    let query = stringify(&query_args);
    if !query.is_empty() {
        url = format!("{url}?{query}");
    }
    let response = reqwest::get(url).await.expect("Failed to get response");
    check_response(&response);
    response
}

mod analytics;
mod builds;
mod info;
mod patches;
mod player;
mod sql;
