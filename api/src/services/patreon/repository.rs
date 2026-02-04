#![allow(dead_code)]

use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use thiserror::Error;

use super::types::{Patron, TokenCryptoError, decrypt_token, encrypt_token};

/// Error type for patron repository operations
#[derive(Debug, Error)]
pub(crate) enum PatronRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Token encryption error: {0}")]
    Encryption(#[from] TokenCryptoError),
}

pub(crate) type PatronRepositoryResult<T> = Result<T, PatronRepositoryError>;

/// Repository for patron database operations
#[derive(Clone)]
pub(crate) struct PatronRepository {
    pg_client: Pool<Postgres>,
    encryption_key: String,
}

/// Parameters for creating or updating a patron
pub(crate) struct UpsertPatronParams {
    pub(crate) patreon_user_id: String,
    pub(crate) email: Option<String>,
    pub(crate) tier_id: Option<String>,
    pub(crate) pledge_amount_cents: Option<i32>,
    pub(crate) is_active: bool,
    pub(crate) access_token: Option<String>,
    pub(crate) refresh_token: Option<String>,
    pub(crate) token_expires_at: Option<DateTime<Utc>>,
}

impl PatronRepository {
    pub(crate) fn new(pg_client: Pool<Postgres>, encryption_key: String) -> Self {
        Self {
            pg_client,
            encryption_key,
        }
    }

    /// Creates or updates a patron record by `patreon_user_id`.
    /// Encrypts `access_token` and `refresh_token` before storing.
    pub(crate) async fn create_or_update_patron(
        &self,
        params: UpsertPatronParams,
    ) -> PatronRepositoryResult<Patron> {
        // Encrypt tokens if provided
        let encrypted_access_token = params
            .access_token
            .as_ref()
            .map(|t| encrypt_token(t, &self.encryption_key))
            .transpose()?;

        let encrypted_refresh_token = params
            .refresh_token
            .as_ref()
            .map(|t| encrypt_token(t, &self.encryption_key))
            .transpose()?;

        let now = Utc::now();

        let row = sqlx::query!(
            r#"
            INSERT INTO patrons (
                patreon_user_id,
                email,
                tier_id,
                pledge_amount_cents,
                is_active,
                access_token,
                refresh_token,
                token_expires_at,
                last_verified_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
            ON CONFLICT (patreon_user_id)
            DO UPDATE SET
                email = COALESCE(EXCLUDED.email, patrons.email),
                tier_id = EXCLUDED.tier_id,
                pledge_amount_cents = EXCLUDED.pledge_amount_cents,
                is_active = EXCLUDED.is_active,
                access_token = COALESCE(EXCLUDED.access_token, patrons.access_token),
                refresh_token = COALESCE(EXCLUDED.refresh_token, patrons.refresh_token),
                token_expires_at = COALESCE(EXCLUDED.token_expires_at, patrons.token_expires_at),
                last_verified_at = EXCLUDED.last_verified_at,
                updated_at = EXCLUDED.updated_at
            RETURNING
                id,
                patreon_user_id,
                email,
                tier_id,
                pledge_amount_cents,
                is_active,
                access_token,
                refresh_token,
                token_expires_at,
                last_verified_at,
                created_at,
                updated_at
            "#,
            params.patreon_user_id,
            params.email,
            params.tier_id,
            params.pledge_amount_cents,
            params.is_active,
            encrypted_access_token,
            encrypted_refresh_token,
            params.token_expires_at,
            now,
        )
        .fetch_one(&self.pg_client)
        .await?;

        // Decrypt tokens for the returned Patron struct
        let decrypted_access_token = row
            .access_token
            .as_ref()
            .map(|t| decrypt_token(t, &self.encryption_key))
            .transpose()?;

        let decrypted_refresh_token = row
            .refresh_token
            .as_ref()
            .map(|t| decrypt_token(t, &self.encryption_key))
            .transpose()?;

        Ok(Patron {
            id: row.id,
            patreon_user_id: row.patreon_user_id,
            email: row.email,
            tier_id: row.tier_id,
            pledge_amount_cents: row.pledge_amount_cents,
            is_active: row.is_active,
            access_token: decrypted_access_token,
            refresh_token: decrypted_refresh_token,
            token_expires_at: row.token_expires_at,
            last_verified_at: row.last_verified_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Gets a patron by their internal UUID.
    /// Decrypts `access_token` and `refresh_token` when reading.
    pub(crate) async fn get_patron_by_id(
        &self,
        patron_id: uuid::Uuid,
    ) -> PatronRepositoryResult<Option<Patron>> {
        let row = sqlx::query!(
            r#"
            SELECT
                id,
                patreon_user_id,
                email,
                tier_id,
                pledge_amount_cents,
                is_active,
                access_token,
                refresh_token,
                token_expires_at,
                last_verified_at,
                created_at,
                updated_at
            FROM patrons
            WHERE id = $1
            "#,
            patron_id,
        )
        .fetch_optional(&self.pg_client)
        .await?;

        match row {
            Some(row) => {
                let decrypted_access_token = row
                    .access_token
                    .as_ref()
                    .map(|t| decrypt_token(t, &self.encryption_key))
                    .transpose()?;

                let decrypted_refresh_token = row
                    .refresh_token
                    .as_ref()
                    .map(|t| decrypt_token(t, &self.encryption_key))
                    .transpose()?;

                Ok(Some(Patron {
                    id: row.id,
                    patreon_user_id: row.patreon_user_id,
                    email: row.email,
                    tier_id: row.tier_id,
                    pledge_amount_cents: row.pledge_amount_cents,
                    is_active: row.is_active,
                    access_token: decrypted_access_token,
                    refresh_token: decrypted_refresh_token,
                    token_expires_at: row.token_expires_at,
                    last_verified_at: row.last_verified_at,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    /// Gets a patron by their Patreon user ID.
    /// Decrypts `access_token` and `refresh_token` when reading.
    pub(crate) async fn get_patron_by_patreon_user_id(
        &self,
        patreon_user_id: &str,
    ) -> PatronRepositoryResult<Option<Patron>> {
        let row = sqlx::query!(
            r#"
            SELECT
                id,
                patreon_user_id,
                email,
                tier_id,
                pledge_amount_cents,
                is_active,
                access_token,
                refresh_token,
                token_expires_at,
                last_verified_at,
                created_at,
                updated_at
            FROM patrons
            WHERE patreon_user_id = $1
            "#,
            patreon_user_id,
        )
        .fetch_optional(&self.pg_client)
        .await?;

        match row {
            Some(row) => {
                let decrypted_access_token = row
                    .access_token
                    .as_ref()
                    .map(|t| decrypt_token(t, &self.encryption_key))
                    .transpose()?;

                let decrypted_refresh_token = row
                    .refresh_token
                    .as_ref()
                    .map(|t| decrypt_token(t, &self.encryption_key))
                    .transpose()?;

                Ok(Some(Patron {
                    id: row.id,
                    patreon_user_id: row.patreon_user_id,
                    email: row.email,
                    tier_id: row.tier_id,
                    pledge_amount_cents: row.pledge_amount_cents,
                    is_active: row.is_active,
                    access_token: decrypted_access_token,
                    refresh_token: decrypted_refresh_token,
                    token_expires_at: row.token_expires_at,
                    last_verified_at: row.last_verified_at,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    /// Updates the tokens for a patron after a successful refresh.
    /// Encrypts tokens before storing.
    pub(crate) async fn update_patron_tokens(
        &self,
        patron_id: uuid::Uuid,
        access_token: &str,
        refresh_token: &str,
        token_expires_at: DateTime<Utc>,
    ) -> PatronRepositoryResult<()> {
        let encrypted_access_token = encrypt_token(access_token, &self.encryption_key)?;
        let encrypted_refresh_token = encrypt_token(refresh_token, &self.encryption_key)?;
        let now = Utc::now();

        sqlx::query!(
            r#"
            UPDATE patrons
            SET access_token = $1,
                refresh_token = $2,
                token_expires_at = $3,
                updated_at = $4
            WHERE id = $5
            "#,
            encrypted_access_token,
            encrypted_refresh_token,
            token_expires_at,
            now,
            patron_id,
        )
        .execute(&self.pg_client)
        .await?;

        Ok(())
    }

    /// Updates the membership status for a patron during daily verification.
    pub(crate) async fn update_patron_membership(
        &self,
        patron_id: uuid::Uuid,
        tier_id: Option<String>,
        pledge_amount_cents: Option<i32>,
        is_active: bool,
    ) -> PatronRepositoryResult<()> {
        let now = Utc::now();

        sqlx::query!(
            r#"
            UPDATE patrons
            SET tier_id = $1,
                pledge_amount_cents = $2,
                is_active = $3,
                last_verified_at = $4,
                updated_at = $4
            WHERE id = $5
            "#,
            tier_id,
            pledge_amount_cents,
            is_active,
            now,
            patron_id,
        )
        .execute(&self.pg_client)
        .await?;

        Ok(())
    }

    /// Gets all patrons that have stored tokens (for daily verification).
    /// Only returns patrons where both `access_token` and `refresh_token` are not null.
    /// Decrypts tokens when reading.
    pub(crate) async fn get_all_patrons_with_tokens(&self) -> PatronRepositoryResult<Vec<Patron>> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id,
                patreon_user_id,
                email,
                tier_id,
                pledge_amount_cents,
                is_active,
                access_token,
                refresh_token,
                token_expires_at,
                last_verified_at,
                created_at,
                updated_at
            FROM patrons
            WHERE access_token IS NOT NULL
              AND refresh_token IS NOT NULL
            "#,
        )
        .fetch_all(&self.pg_client)
        .await?;

        let mut patrons = Vec::with_capacity(rows.len());
        for row in rows {
            let decrypted_access_token = row
                .access_token
                .as_ref()
                .map(|t| decrypt_token(t, &self.encryption_key))
                .transpose()?;

            let decrypted_refresh_token = row
                .refresh_token
                .as_ref()
                .map(|t| decrypt_token(t, &self.encryption_key))
                .transpose()?;

            patrons.push(Patron {
                id: row.id,
                patreon_user_id: row.patreon_user_id,
                email: row.email,
                tier_id: row.tier_id,
                pledge_amount_cents: row.pledge_amount_cents,
                is_active: row.is_active,
                access_token: decrypted_access_token,
                refresh_token: decrypted_refresh_token,
                token_expires_at: row.token_expires_at,
                last_verified_at: row.last_verified_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            });
        }

        Ok(patrons)
    }
}
