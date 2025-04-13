use crate::utils;
use reqwest::Response;

pub async fn request_endpoint(endpoint: &str) -> Response {
    let response = reqwest::get(format!("http://localhost:3000{endpoint}"))
        .await
        .expect("Failed to get response");
    utils::check_response(&response);
    response
}
