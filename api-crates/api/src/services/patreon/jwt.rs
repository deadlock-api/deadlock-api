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
pub(crate) fn create_session_token(patron_id: Uuid, secret: &str) -> JwtResult<String> {
    // Out of `DateTime` range only in the far future; an already-expired token fails closed.
    let now = Utc::now();
    let expiration = now.checked_add_signed(Duration::days(7)).unwrap_or(now);

    let claims = PatronClaims {
        patron_id,
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
    .map_err(|_invalid| JwtError::InvalidToken)?;

    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_token_roundtrip() {
        let patron_id = Uuid::new_v4();
        let token = create_session_token(patron_id, "secret").unwrap();
        let claims = validate_session_token(&token, "secret").unwrap();
        assert_eq!(claims.patron_id, patron_id);
        assert!(matches!(
            validate_session_token(&token, "other"),
            Err(JwtError::InvalidToken)
        ));
    }
}
