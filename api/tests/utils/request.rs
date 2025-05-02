use crate::utils;
use reqwest::Response;
use std::str::FromStr;
use url::Url;

pub async fn request_endpoint(
    endpoint: &str,
    query_args: impl IntoIterator<Item = (&str, &str)>,
) -> Response {
    let mut url: Url = Url::from_str(&format!("http://api:3000{endpoint}")).unwrap();
    for (name, val) in query_args {
        url.query_pairs_mut().append_pair(name, val);
    }
    let response = reqwest::get(url).await.expect("Failed to get response");
    utils::check_response(&response);
    response
}
