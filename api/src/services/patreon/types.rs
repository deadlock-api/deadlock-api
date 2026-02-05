#![allow(dead_code)]

use aes_gcm::aead::generic_array::GenericArray;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use thiserror::Error;
use uuid::Uuid;

/// Response from Patreon OAuth token endpoint
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct TokenResponse {
    pub(crate) access_token: String,
    pub(crate) refresh_token: String,
    pub(crate) expires_in: i64,
}

/// Patron identity information from Patreon API
#[derive(Debug, Clone)]
pub(crate) struct PatronIdentity {
    /// Patreon user ID
    pub(crate) id: String,
    /// User's email address
    pub(crate) email: Option<String>,
}

/// Raw response from Patreon identity endpoint (JSON:API format)
#[derive(Debug, Deserialize)]
pub(crate) struct IdentityResponse {
    pub(crate) data: IdentityData,
}

#[derive(Debug, Deserialize)]
pub(crate) struct IdentityData {
    pub(crate) id: String,
    pub(crate) attributes: IdentityAttributes,
}

#[derive(Debug, Deserialize)]
pub(crate) struct IdentityAttributes {
    pub(crate) email: Option<String>,
}

/// Membership information for a patron
#[derive(Debug, Clone)]
pub(crate) struct Membership {
    /// Tier ID the patron is subscribed to
    pub(crate) tier_id: Option<String>,
    /// Currently entitled amount in cents
    pub(crate) pledge_amount_cents: i32,
    /// Patron status (e.g., `active_patron`, `declined_patron`, `former_patron`)
    pub(crate) patron_status: Option<String>,
}

/// Raw response from Patreon identity endpoint with memberships included (JSON:API format)
#[derive(Debug, Deserialize)]
pub(crate) struct IdentityWithMembershipsResponse {
    pub(crate) data: IdentityData,
    #[serde(default)]
    pub(crate) included: Vec<IncludedResource>,
}

/// A resource included in the JSON:API response
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum IncludedResource {
    #[serde(rename = "member")]
    Member(MemberResource),
    #[serde(other)]
    Other,
}

/// Member resource from JSON:API included array
#[derive(Debug, Deserialize)]
pub(crate) struct MemberResource {
    pub(crate) id: String,
    pub(crate) attributes: MemberAttributes,
    #[serde(default)]
    pub(crate) relationships: MemberRelationships,
}

/// Member attributes from Patreon API
#[derive(Debug, Deserialize)]
pub(crate) struct MemberAttributes {
    /// Currently entitled amount in cents
    pub(crate) currently_entitled_amount_cents: Option<i32>,
    /// Patron status
    pub(crate) patron_status: Option<String>,
}

/// Member relationships from Patreon API
#[derive(Debug, Default, Deserialize)]
pub(crate) struct MemberRelationships {
    #[serde(default)]
    pub(crate) currently_entitled_tiers: TierRelationship,
    #[serde(default)]
    pub(crate) campaign: CampaignRelationship,
}

/// Tier relationship data
#[derive(Debug, Default, Deserialize)]
pub(crate) struct TierRelationship {
    #[serde(default)]
    pub(crate) data: Vec<TierRef>,
}

/// Reference to a tier
#[derive(Debug, Deserialize)]
pub(crate) struct TierRef {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) resource_type: String,
}

/// Campaign relationship data
#[derive(Debug, Default, Deserialize)]
pub(crate) struct CampaignRelationship {
    pub(crate) data: Option<CampaignRef>,
}

/// Reference to a campaign
#[derive(Debug, Deserialize)]
pub(crate) struct CampaignRef {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) resource_type: String,
}

/// Error type for Patreon API calls
#[derive(Debug, Error)]
pub(crate) enum PatreonError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Invalid response from Patreon: {0}")]
    InvalidResponse(String),
}

pub(crate) type PatreonResult<T> = Result<T, PatreonError>;

/// Patron record from the database
#[derive(Debug, Clone)]
pub(crate) struct Patron {
    pub(crate) id: Uuid,
    pub(crate) patreon_user_id: String,
    pub(crate) email: Option<String>,
    pub(crate) tier_id: Option<String>,
    pub(crate) pledge_amount_cents: Option<i32>,
    /// Override for slot limit (when set, takes precedence over pledge-based calculation)
    pub(crate) slot_override: Option<i32>,
    pub(crate) is_active: bool,
    pub(crate) access_token: Option<String>,
    pub(crate) refresh_token: Option<String>,
    pub(crate) token_expires_at: Option<DateTime<Utc>>,
    pub(crate) last_verified_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

impl Patron {
    /// Calculates the number of Steam account slots for this patron.
    ///
    /// Uses `slot_override` if set, otherwise calculates from `pledge_amount_cents / 100` capped at 10.
    pub(crate) fn slot_limit(&self) -> i32 {
        calculate_slot_limit(self.slot_override, self.pledge_amount_cents)
    }
}

/// Calculates the number of Steam account slots from raw values.
///
/// Uses `slot_override` if set, otherwise calculates from `pledge_amount_cents / 100` capped at 10.
pub(crate) fn calculate_slot_limit(
    slot_override: Option<i32>,
    pledge_amount_cents: Option<i32>,
) -> i32 {
    slot_override.unwrap_or_else(|| (pledge_amount_cents.unwrap_or(0) / 300).min(10))
}

/// Error type for token encryption/decryption
#[derive(Debug, Error)]
pub(crate) enum TokenCryptoError {
    #[error("Invalid encryption key: {0}")]
    InvalidKey(String),
    #[error("Encryption failed")]
    EncryptionFailed,
    #[error("Decryption failed")]
    DecryptionFailed,
    #[error("Invalid encrypted data format")]
    InvalidFormat,
}

/// Encrypts a token using AES-256-GCM
/// Returns base64-encoded nonce + ciphertext
pub(crate) fn encrypt_token(plaintext: &str, key_hex: &str) -> Result<String, TokenCryptoError> {
    let key_bytes = hex::decode(key_hex)
        .map_err(|e| TokenCryptoError::InvalidKey(format!("Invalid hex key: {e}")))?;

    if key_bytes.len() != 32 {
        return Err(TokenCryptoError::InvalidKey(format!(
            "Key must be 32 bytes, got {}",
            key_bytes.len()
        )));
    }

    let key = GenericArray::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    // Generate random 12-byte nonce
    let nonce_bytes: [u8; 12] = aes_gcm::aead::rand_core::RngCore::next_u64(&mut OsRng)
        .to_le_bytes()
        .into_iter()
        .chain(aes_gcm::aead::rand_core::RngCore::next_u32(&mut OsRng).to_le_bytes())
        .collect::<Vec<u8>>()
        .try_into()
        .expect("12 bytes");
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| TokenCryptoError::EncryptionFailed)?;

    // Combine nonce + ciphertext and base64 encode
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &combined,
    ))
}

/// Decrypts a token encrypted with `encrypt_token`
pub(crate) fn decrypt_token(encrypted: &str, key_hex: &str) -> Result<String, TokenCryptoError> {
    let key_bytes = hex::decode(key_hex)
        .map_err(|e| TokenCryptoError::InvalidKey(format!("Invalid hex key: {e}")))?;

    if key_bytes.len() != 32 {
        return Err(TokenCryptoError::InvalidKey(format!(
            "Key must be 32 bytes, got {}",
            key_bytes.len()
        )));
    }

    let combined = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encrypted)
        .map_err(|_| TokenCryptoError::InvalidFormat)?;

    if combined.len() < 12 {
        return Err(TokenCryptoError::InvalidFormat);
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let key = GenericArray::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| TokenCryptoError::DecryptionFailed)?;

    String::from_utf8(plaintext).map_err(|_| TokenCryptoError::DecryptionFailed)
}
