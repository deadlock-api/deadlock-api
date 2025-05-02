use crate::utils;
use reqwest::Response;

pub async fn request_endpoint(
    endpoint: &str,
    query_args: impl IntoIterator<Item = (&str, &str)>,
) -> Response {
    let mut url = format!("http://api:3000{endpoint}");
    let query = querystring::stringify(query_args.into_iter().collect());
    if !query.is_empty() {
        url = format!("{url}?{query}");
    }
    let response = reqwest::get(url).await.expect("Failed to get response");
    utils::check_response(&response);
    response
}
