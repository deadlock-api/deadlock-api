use axum::extract::{Query, State};
use axum::http::header::{COOKIE, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::{Duration, Utc};
use rand::Rng;
use serde::Deserialize;

use crate::context::AppState;
use crate::services::patreon::client::PatreonClient;
use crate::services::patreon::jwt::create_session_token;
use crate::services::patreon::repository::{PatronRepository, UpsertPatronParams};

/// Patreon OAuth scopes required for this application
const PATREON_SCOPES: &str = "identity identity[email] campaigns.members";

/// Generate a random 32-byte hex string for OAuth state parameter
fn generate_state() -> String {
    let random_bytes: [u8; 32] = rand::rng().random();
    hex::encode(random_bytes)
}

/// Build the Patreon OAuth authorization URL
fn build_patreon_auth_url(client_id: &str, redirect_uri: &str, state: &str) -> String {
    let encoded_redirect_uri = urlencoding::encode(redirect_uri);
    let encoded_scopes = urlencoding::encode(PATREON_SCOPES);

    format!(
        "https://www.patreon.com/oauth2/authorize?response_type=code&client_id={client_id}&redirect_uri={encoded_redirect_uri}&scope={encoded_scopes}&state={state}"
    )
}

/// GET /v1/auth/patreon
///
/// Initiates Patreon OAuth flow by:
/// 1. Generating a random state parameter for CSRF protection
/// 2. Storing the state in a cookie
/// 3. Redirecting to Patreon's OAuth authorization URL
pub(crate) async fn login(State(state): State<AppState>) -> impl IntoResponse {
    let oauth_state = generate_state();

    let auth_url = build_patreon_auth_url(
        &state.config.patreon.client_id,
        &state.config.patreon.redirect_uri,
        &oauth_state,
    );

    // Create the state cookie with HttpOnly, Secure, SameSite=Lax for CSRF protection
    // Max-Age of 10 minutes should be plenty for the OAuth flow
    let cookie_value = format!(
        "patreon_oauth_state={oauth_state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600"
    );

    let mut response = Response::builder()
        .status(StatusCode::FOUND)
        .header("Location", auth_url)
        .body(axum::body::Body::empty())
        .expect("Failed to build redirect response");

    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie_value).expect("Invalid cookie value"),
    );

    response
}

/// Query parameters for the OAuth callback
#[derive(Deserialize)]
pub(crate) struct CallbackParams {
    /// Authorization code from Patreon (absent if user cancels the flow)
    code: Option<String>,
    /// State parameter for CSRF protection
    state: Option<String>,
}

/// Extracts the OAuth state from the `patreon_oauth_state` cookie
fn extract_state_from_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get(COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let cookie = cookie.trim();
                cookie
                    .strip_prefix("patreon_oauth_state=")
                    .map(str::to_string)
            })
        })
}

/// POST /v1/auth/patreon/logout
///
/// Logs out the patron by clearing the session cookie.
/// Returns 200 OK after clearing the cookie.
pub(crate) async fn logout() -> impl IntoResponse {
    // Clear the patron_session cookie by setting Max-Age=0
    let clear_session_cookie = "patron_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

    let mut response = Response::builder()
        .status(StatusCode::OK)
        .body(axum::body::Body::empty())
        .expect("Failed to build response");

    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(clear_session_cookie).expect("Invalid cookie value"),
    );

    response
}

/// GET /v1/auth/patreon/callback
///
/// Handles the OAuth callback from Patreon:
/// 1. Validates the state parameter against the stored cookie (CSRF protection)
/// 2. Exchanges the authorization code for access/refresh tokens
/// 3. Fetches patron identity and membership status
/// 4. Creates or updates patron record in database
/// 5. Generates JWT session token and sets it as a cookie
/// 6. Redirects to the frontend redirect URL
#[allow(clippy::too_many_lines)]
pub(crate) async fn callback(
    State(app_state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<CallbackParams>,
) -> impl IntoResponse {
    // If the user cancelled the OAuth flow, Patreon redirects back without a code.
    // Redirect them back to the frontend gracefully.
    let Some(code) = params.code else {
        return Response::builder()
            .status(StatusCode::FOUND)
            .header("Location", &app_state.config.patreon.frontend_redirect_url)
            .body(axum::body::Body::empty())
            .expect("Failed to build redirect response");
    };

    // Step 1: Validate state parameter matches cookie (CSRF protection)
    let Some(stored_state) = extract_state_from_cookie(&headers) else {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from("Missing OAuth state cookie"))
            .expect("Failed to build error response");
    };

    let Some(ref state_param) = params.state else {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from("Missing OAuth state parameter"))
            .expect("Failed to build error response");
    };

    if *state_param != stored_state {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from("Invalid OAuth state"))
            .expect("Failed to build error response");
    }

    // Create Patreon client
    let patreon_client = PatreonClient::new(
        reqwest::Client::new(),
        app_state.config.patreon.client_id.clone(),
        app_state.config.patreon.client_secret.clone(),
        app_state.config.patreon.redirect_uri.clone(),
    );

    // Step 2: Exchange authorization code for tokens
    let token_response = match patreon_client.exchange_code(&code).await {
        Ok(response) => response,
        Err(e) => {
            tracing::error!("Failed to exchange code: {e}");
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(axum::body::Body::from(
                    "Failed to authenticate with Patreon",
                ))
                .expect("Failed to build error response");
        }
    };

    // Step 3: Fetch patron identity
    let identity = match patreon_client
        .get_identity(&token_response.access_token)
        .await
    {
        Ok(identity) => identity,
        Err(e) => {
            tracing::error!("Failed to get identity: {e}");
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(axum::body::Body::from("Failed to fetch Patreon identity"))
                .expect("Failed to build error response");
        }
    };

    // Step 3b: Fetch membership status
    let membership = match patreon_client
        .get_membership(
            &token_response.access_token,
            &app_state.config.patreon.campaign_id,
        )
        .await
    {
        Ok(membership) => membership,
        Err(e) => {
            tracing::error!("Failed to get membership: {e}");
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(axum::body::Body::from("Failed to fetch Patreon membership"))
                .expect("Failed to build error response");
        }
    };

    // Extract membership details (defaults for non-members)
    let (tier_id, pledge_amount_cents, is_active) = match &membership {
        Some(m) => {
            let is_active = m
                .patron_status
                .as_ref()
                .is_some_and(|s| s == "active_patron");
            (m.tier_id.clone(), m.pledge_amount_cents, is_active)
        }
        None => (None, 0, false),
    };

    // Calculate token expiration time
    let token_expires_at = Utc::now() + Duration::seconds(token_response.expires_in);

    // Step 4: Create or update patron record
    let patron_repo = PatronRepository::new(
        app_state.pg_client.clone(),
        app_state.config.patron_encryption_key.clone(),
    );

    let patron = match patron_repo
        .create_or_update_patron(UpsertPatronParams {
            patreon_user_id: identity.id,
            email: identity.email,
            tier_id,
            pledge_amount_cents: Some(pledge_amount_cents),
            is_active,
            access_token: Some(token_response.access_token),
            refresh_token: Some(token_response.refresh_token),
            token_expires_at: Some(token_expires_at),
        })
        .await
    {
        Ok(patron) => patron,
        Err(e) => {
            tracing::error!("Failed to save patron: {e}");
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(axum::body::Body::from("Failed to save patron data"))
                .expect("Failed to build error response");
        }
    };

    // Step 5: Generate JWT session token
    let session_token = match create_session_token(patron.id, &app_state.config.jwt_secret) {
        Ok(token) => token,
        Err(e) => {
            tracing::error!("Failed to create session token: {e}");
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(axum::body::Body::from("Failed to create session"))
                .expect("Failed to build error response");
        }
    };

    // Step 6: Set session cookie and redirect to frontend
    // Session cookie valid for 7 days (matches JWT expiration)
    let session_cookie = format!(
        "patron_session={session_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800"
    );

    // Clear the OAuth state cookie
    let clear_state_cookie =
        "patreon_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

    let mut response = Response::builder()
        .status(StatusCode::FOUND)
        .header("Location", &app_state.config.patreon.frontend_redirect_url)
        .body(axum::body::Body::empty())
        .expect("Failed to build redirect response");

    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&session_cookie).expect("Invalid session cookie value"),
    );
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(clear_state_cookie).expect("Invalid clear cookie value"),
    );

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_state_length() {
        let state = generate_state();
        // 32 bytes = 64 hex characters
        assert_eq!(state.len(), 64);
    }

    #[test]
    fn test_generate_state_uniqueness() {
        let state1 = generate_state();
        let state2 = generate_state();
        assert_ne!(state1, state2);
    }

    #[test]
    fn test_build_patreon_auth_url() {
        let url = build_patreon_auth_url(
            "test_client_id",
            "https://example.com/callback",
            "test_state_123",
        );

        assert!(url.starts_with("https://www.patreon.com/oauth2/authorize?"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id=test_client_id"));
        assert!(url.contains("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback"));
        assert!(url.contains("scope=identity%20identity%5Bemail%5D%20campaigns.members"));
        assert!(url.contains("state=test_state_123"));
    }
}
