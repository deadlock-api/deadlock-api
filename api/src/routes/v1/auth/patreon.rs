use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::header::{COOKIE, LOCATION, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::{Duration, Utc};
use rand::RngExt;
use serde::Deserialize;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::patreon::client::PatreonClient;
use crate::services::patreon::jwt::create_session_token;
use crate::services::patreon::repository::{PatronRepository, UpsertPatronParams};
use crate::services::patreon::types::Patron;

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

    // oauth_state is hex-encoded (only [0-9a-f]), so this cannot fail
    let cookie_header = HeaderValue::from_str(&cookie_value)
        .expect("hex-encoded oauth state is always a valid header value");

    let mut response = redirect(&auth_url);

    response.headers_mut().insert(SET_COOKIE, cookie_header);

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
fn extract_state_from_cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies
                .split(';')
                .find_map(|cookie| cookie.trim().strip_prefix("patreon_oauth_state="))
        })
}

/// POST /v1/auth/patreon/logout
///
/// Logs out the patron by clearing the session cookie.
/// Returns 200 OK after clearing the cookie.
pub(crate) async fn logout(State(state): State<AppState>) -> impl IntoResponse {
    // Clear the patron_session cookie by setting Max-Age=0.
    // SameSite=None (with Secure) so the attributes match the cookie set in `callback`,
    // which must ride along on cross-site XHR/SSE to sibling APIs like ai.deadlock-api.com.
    let base_clear = "patron_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0";
    // Always emit a host-only clear (no Domain attribute) in addition to the
    // domain-scoped ones. Older builds set `patron_session` host-only (scoped to
    // api.deadlock-api.com), and a `Domain=.deadlock-api.com` clear does NOT remove
    // a host-only cookie. Without this, anyone still carrying a stale host-only
    // cookie can never log it out, and it shadows the real `.deadlock-api.com`
    // cookie on api.* requests.
    let mut clear_cookie_headers: Vec<HeaderValue> = vec![HeaderValue::from_static(base_clear)];
    for domain in &state.config.patreon.cookie_domains {
        match HeaderValue::from_str(&format!("{base_clear}; Domain={domain}")) {
            Ok(header) => clear_cookie_headers.push(header),
            Err(e) => tracing::error!("Skipping invalid cookie domain in logout clear: {e}"),
        }
    }

    let mut response = StatusCode::OK.into_response();

    for header in clear_cookie_headers {
        response.headers_mut().append(SET_COOKIE, header);
    }

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
pub(crate) async fn callback(
    State(app_state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<CallbackParams>,
) -> Response {
    // If the user cancelled the OAuth flow, Patreon redirects back without a code.
    // Redirect them back to the frontend gracefully.
    let Some(code) = params.code else {
        return redirect(&app_state.config.patreon.frontend_redirect_url);
    };

    // Step 1: Validate state parameter matches cookie (CSRF protection)
    if let Err(message) = validate_oauth_state(&headers, params.state.as_deref()) {
        return plain_response(StatusCode::BAD_REQUEST, message);
    }

    // Steps 2-4: Authenticate with Patreon and save the patron
    let patron = match upsert_patron_from_code(&app_state, &code).await {
        Ok(patron) => patron,
        Err((status, message)) => return plain_response(status, message),
    };

    // Step 5: Generate JWT session token
    let session_token = match create_session_token(patron.id, &app_state.config.jwt_secret) {
        Ok(token) => token,
        Err(e) => {
            let (status, message) = logged_failure(
                "Failed to create session token",
                e,
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create session",
            );
            return plain_response(status, message);
        }
    };

    // Step 6: Set session cookie and redirect to frontend
    session_redirect(&app_state, &session_token)
}

/// Checks the `state` parameter against the `patreon_oauth_state` cookie, returning the error
/// message on a mismatch.
fn validate_oauth_state(
    headers: &HeaderMap,
    state_param: Option<&str>,
) -> Result<(), &'static str> {
    let stored_state = extract_state_from_cookie(headers).ok_or("Missing OAuth state cookie")?;
    let state_param = state_param.ok_or("Missing OAuth state parameter")?;
    if state_param != stored_state {
        return Err("Invalid OAuth state");
    }
    Ok(())
}

/// Exchanges the authorization code for tokens, fetches the patron's identity and membership,
/// and creates or updates the patron record. Failures carry the response status and message.
async fn upsert_patron_from_code(
    app_state: &AppState,
    code: &str,
) -> Result<Patron, (StatusCode, &'static str)> {
    let patreon_client = PatreonClient::new(
        app_state.http_client.clone(),
        app_state.config.patreon.client_id.clone(),
        app_state.config.patreon.client_secret.clone(),
        app_state.config.patreon.redirect_uri.clone(),
    );

    // Step 2: Exchange authorization code for tokens
    let token_response = patreon_client.exchange_code(code).await.map_err(|e| {
        logged_failure(
            "Failed to exchange code",
            e,
            StatusCode::BAD_GATEWAY,
            "Failed to authenticate with Patreon",
        )
    })?;

    // Step 3: Fetch patron identity and membership status
    let identity = patreon_client
        .get_identity(&token_response.access_token)
        .await
        .map_err(|e| {
            logged_failure(
                "Failed to get identity",
                e,
                StatusCode::BAD_GATEWAY,
                "Failed to fetch Patreon identity",
            )
        })?;
    let membership = patreon_client
        .get_membership(&token_response.access_token)
        .await
        .map_err(|e| {
            logged_failure(
                "Failed to get membership",
                e,
                StatusCode::BAD_GATEWAY,
                "Failed to fetch Patreon membership",
            )
        })?;

    // Extract membership details (defaults for non-members)
    let (tier_id, pledge_amount_cents, is_active) = match membership {
        Some(m) => {
            let is_active = m.patron_status.as_deref() == Some("active_patron");
            (m.tier_id, m.pledge_amount_cents, is_active)
        }
        None => (None, 0, false),
    };

    // Step 4: Create or update patron record
    let token_expires_at = Utc::now() + Duration::seconds(token_response.expires_in);
    PatronRepository::new(
        app_state.pg_client.clone(),
        app_state.config.patron_encryption_key.clone(),
    )
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
    .map_err(|e| {
        logged_failure(
            "Failed to save patron",
            e,
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to save patron data",
        )
    })
}

/// Redirects to the frontend, setting the session cookie and clearing the OAuth state cookie.
fn session_redirect(app_state: &AppState, session_token: &str) -> Response {
    // Session cookie valid for 7 days (matches JWT expiration).
    // SameSite=None (with Secure) is required so the browser includes the cookie on
    // cross-site XHR/fetch/SSE requests to sibling APIs (e.g. ai.deadlock-api.com).
    // SameSite=Lax would be dropped on those subresource requests. The Domain attribute
    // (.deadlock-api.com, from PATREON_COOKIE_DOMAINS) is what scopes it to all subdomains.
    let base_cookie = format!(
        "patron_session={session_token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=604800"
    );
    let domains = &app_state.config.patreon.cookie_domains;
    let session_cookie_headers: Result<Vec<HeaderValue>, _> = if domains.is_empty() {
        HeaderValue::from_str(&base_cookie).map(|header| vec![header])
    } else {
        domains
            .iter()
            .map(|domain| HeaderValue::from_str(&format!("{base_cookie}; Domain={domain}")))
            .collect()
    };
    let session_cookie_headers = match session_cookie_headers {
        Ok(headers) => headers,
        Err(e) => {
            tracing::error!("Failed to encode session cookie as header value: {e}");
            return APIError::internal("Failed to create session").into_response();
        }
    };

    let mut response = redirect(&app_state.config.patreon.frontend_redirect_url);
    let response_headers = response.headers_mut();
    for header in session_cookie_headers {
        response_headers.append(SET_COOKIE, header);
    }
    response_headers.append(
        SET_COOKIE,
        HeaderValue::from_static(
            "patreon_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
        ),
    );
    response
}

/// Logs `error` with `context` and returns the response `status` and `message`.
fn logged_failure(
    context: &str,
    error: impl core::fmt::Display,
    status: StatusCode,
    message: &'static str,
) -> (StatusCode, &'static str) {
    tracing::error!("{context}: {error}");
    (status, message)
}

/// A `302 Found` redirect to `location`.
fn redirect(location: &str) -> Response {
    (StatusCode::FOUND, [(LOCATION, location)]).into_response()
}

/// A plain-text error response.
fn plain_response(status: StatusCode, message: &'static str) -> Response {
    (status, Body::from(message)).into_response()
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
