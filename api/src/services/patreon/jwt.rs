use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

/// Claims stored in patron JWT session token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PatronClaims {
    /// Patron's database UUID
    pub(crate) patron_id: Uuid,
    /// Number of Steam account slots based on pledge amount
    pub(crate) slot_limit: i32,
    /// Expiration time (Unix timestamp)
    pub(crate) exp: i64,
}

/// Error type for JWT operations
#[derive(Debug, Error)]
pub(crate) enum JwtError {
    #[error("Failed to encode JWT: {0}")]
    EncodingError(#[from] jsonwebtoken::errors::Error),
    #[error("Invalid or expired token")]
    InvalidToken,
}

pub(crate) type JwtResult<T> = Result<T, JwtError>;

/// Creates a JWT session token for a patron
///
/// Tokens are valid for 7 days from creation.
pub(crate) fn create_session_token(
    patron_id: Uuid,
    slot_limit: i32,
    secret: &str,
) -> JwtResult<String> {
    let expiration = Utc::now() + Duration::days(7);

    let claims = PatronClaims {
        patron_id,
        slot_limit,
        exp: expiration.timestamp(),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;

    Ok(token)
}

/// Validates a JWT session token and extracts the claims
///
/// Returns an error if the token is invalid, expired, or has an invalid signature.
pub(crate) fn validate_session_token(token: &str, secret: &str) -> JwtResult<PatronClaims> {
    let token_data = decode::<PatronClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| JwtError::InvalidToken)?;

    Ok(token_data.claims)
}
