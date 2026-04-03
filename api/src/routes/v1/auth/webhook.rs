use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use hmac::{Hmac, KeyInit, Mac};
use md5::Md5;
use tracing::{error, info, warn};

use crate::context::AppState;
use crate::services::patreon::membership::{handle_downgrade_or_cancellation, handle_reactivation};
use crate::services::patreon::repository::PatronRepository;
use crate::services::patreon::steam_accounts_repository::SteamAccountsRepository;
use crate::services::patreon::webhook_types::{PatreonWebhookEvent, WebhookPayload};

type HmacMd5 = Hmac<Md5>;

/// Verify the HMAC-MD5 signature from the `X-Patreon-Signature` header.
fn verify_signature(body: &[u8], secret: &str, signature_hex: &str) -> bool {
    let Ok(mut mac) = HmacMd5::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    let Ok(expected) = hex::decode(signature_hex) else {
        return false;
    };
    mac.verify_slice(&expected).is_ok()
}

/// POST /v1/auth/patreon/webhook
///
/// Receives Patreon webhook events, verifies the HMAC-MD5 signature,
/// and processes membership updates in the background.
#[allow(clippy::too_many_lines)]
pub(crate) async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let Some(patreon_config) = &state.config.patreon else {
        return Response::builder()
            .status(StatusCode::SERVICE_UNAVAILABLE)
            .body(axum::body::Body::from(
                "Patreon authentication is not configured",
            ))
            .expect("Failed to build error response");
    };

    // Extract required headers
    let Some(signature) = headers
        .get("X-Patreon-Signature")
        .and_then(|v| v.to_str().ok())
    else {
        warn!("Patreon webhook: missing or invalid X-Patreon-Signature header");
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from(
                "Missing or invalid X-Patreon-Signature header",
            ))
            .expect("Failed to build error response");
    };

    let Some(event_header) = headers.get("X-Patreon-Event").and_then(|v| v.to_str().ok()) else {
        warn!("Patreon webhook: missing or invalid X-Patreon-Event header");
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from(
                "Missing or invalid X-Patreon-Event header",
            ))
            .expect("Failed to build error response");
    };

    // Verify HMAC-MD5 signature
    if !verify_signature(&body, &patreon_config.webhook_secret, signature) {
        warn!("Patreon webhook: invalid signature");
        return Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .body(axum::body::Body::from("Invalid signature"))
            .expect("Failed to build error response");
    }

    // Parse event type - return 200 for unrecognized events
    let Some(event) = PatreonWebhookEvent::from_header(event_header) else {
        info!("Patreon webhook: ignoring unrecognized event: {event_header}");
        return Response::builder()
            .status(StatusCode::OK)
            .body(axum::body::Body::from("Event received but not processed"))
            .expect("Failed to build response");
    };

    // Deserialize JSON:API payload
    let payload: WebhookPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            error!("Patreon webhook: failed to parse payload: {e}");
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(axum::body::Body::from("Invalid JSON payload"))
                .expect("Failed to build error response");
        }
    };

    // Validate campaign ID
    let campaign_matches = payload
        .data
        .relationships
        .campaign
        .data
        .as_ref()
        .is_some_and(|c| c.id == patreon_config.campaign_id);

    if !campaign_matches {
        warn!("Patreon webhook: campaign ID mismatch, ignoring");
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from("Campaign ID mismatch in payload"))
            .expect("Failed to build error response");
    }

    // Extract patreon user ID from relationships
    let Some(patreon_user_id) = payload
        .data
        .relationships
        .user
        .data
        .as_ref()
        .map(|u| u.id.clone())
    else {
        error!("Patreon webhook: missing user relationship in payload");
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from(
                "Missing user relationship in payload",
            ))
            .expect("Failed to build error response");
    };

    // Extract membership data
    let tier_id = payload
        .data
        .relationships
        .currently_entitled_tiers
        .data
        .first()
        .map(|t| t.id.clone());

    let pledge_amount_cents = payload
        .data
        .attributes
        .pledge_amount_cents
        .or(payload.data.attributes.currently_entitled_amount_cents);

    let is_active = payload.data.attributes.patron_status.as_deref() == Some("active_patron");

    info!(
        "Patreon webhook: {event:?} for user {patreon_user_id} (active: {is_active}, pledge: {pledge_amount_cents:?})"
    );

    // Spawn background task for DB operations
    let pg_client = state.pg_client.clone();
    let encryption_key = state.config.patron_encryption_key.clone();

    tokio::spawn(async move {
        let patron_repo = PatronRepository::new(pg_client.clone(), encryption_key);
        let steam_accounts_repo = SteamAccountsRepository::new(pg_client);

        // Look up patron by patreon_user_id
        let patron = match patron_repo
            .get_patron_by_patreon_user_id(&patreon_user_id)
            .await
        {
            Ok(Some(p)) => p,
            Ok(None) => {
                info!(
                    "Patreon webhook: no patron found for patreon_user_id {patreon_user_id}, ignoring"
                );
                return;
            }
            Err(e) => {
                error!("Patreon webhook: failed to look up patron {patreon_user_id}: {e}");
                return;
            }
        };

        // Update membership
        if let Err(e) = patron_repo
            .update_patron_membership(patron.id, tier_id, pledge_amount_cents, is_active)
            .await
        {
            error!("Patreon webhook: failed to update membership for {patreon_user_id}: {e}");
            return;
        }

        // Handle downgrade/cancellation
        if let Err(e) = handle_downgrade_or_cancellation(
            &steam_accounts_repo,
            patron.id,
            &patreon_user_id,
            pledge_amount_cents,
            is_active,
            patron.slot_override,
        )
        .await
        {
            error!(
                "Patreon webhook: failed to handle downgrade/cancellation for {patreon_user_id}: {e}"
            );
        }

        // Handle reactivation (re-subscribe)
        if let Err(e) = handle_reactivation(
            &steam_accounts_repo,
            patron.id,
            &patreon_user_id,
            pledge_amount_cents,
            is_active,
            patron.slot_override,
        )
        .await
        {
            error!("Patreon webhook: failed to handle reactivation for {patreon_user_id}: {e}");
        }
    });

    // Return 200 immediately so Patreon doesn't retry
    Response::builder()
        .status(StatusCode::OK)
        .body(axum::body::Body::from("Event received"))
        .expect("Failed to build response")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_signature_valid() {
        let body = b"test body content";
        let secret = "webhook_secret_123";

        // Compute expected HMAC-MD5
        let mut mac = HmacMd5::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let result = mac.finalize();
        let signature = hex::encode(result.into_bytes());

        assert!(verify_signature(body, secret, &signature));
    }

    #[test]
    fn test_verify_signature_invalid() {
        let body = b"test body content";
        let secret = "webhook_secret_123";
        let wrong_signature = "0000000000000000000000000000000f";

        assert!(!verify_signature(body, secret, wrong_signature));
    }

    #[test]
    fn test_verify_signature_bad_hex() {
        let body = b"test body content";
        let secret = "webhook_secret_123";

        assert!(!verify_signature(body, secret, "not_valid_hex_zz"));
    }
}
