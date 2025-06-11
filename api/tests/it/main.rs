use deadlock_api_rust::utils::parse;
use reqwest::Response;

pub fn check_response(response: &Response) {
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .unwrap(),
        "*"
    );
}

pub async fn request_endpoint(
    endpoint: &str,
    query_args: impl IntoIterator<Item = (&str, &str)>,
) -> Response {
    let mut url = format!("http://localhost:3000{endpoint}");
    let query = parse::stringify(query_args.into_iter().collect());
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
