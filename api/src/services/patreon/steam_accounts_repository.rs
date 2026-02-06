#![allow(dead_code)]

use chrono::{DateTime, Duration, Utc};
use sqlx::{Pool, Postgres};
use thiserror::Error;
use uuid::Uuid;

/// Error type for steam accounts repository operations
#[derive(Debug, Error)]
pub(crate) enum SteamAccountsRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Account not found or does not belong to patron")]
    AccountNotFound,
}

pub(crate) type SteamAccountsRepositoryResult<T> = Result<T, SteamAccountsRepositoryError>;

/// A prioritized Steam account record from the database
#[derive(Debug, Clone)]
pub(crate) struct SteamAccount {
    pub(crate) id: Uuid,
    pub(crate) patron_id: Option<Uuid>,
    pub(crate) steam_id3: i64,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) deleted_at: Option<DateTime<Utc>>,
}

/// Repository for prioritized Steam accounts database operations
#[derive(Clone)]
pub(crate) struct SteamAccountsRepository {
    pg_client: Pool<Postgres>,
}

impl SteamAccountsRepository {
    pub(crate) fn new(pg_client: Pool<Postgres>) -> Self {
        Self { pg_client }
    }

    /// Gets a single Steam account by ID, verifying patron ownership.
    pub(crate) async fn get_account_by_id(
        &self,
        account_id: Uuid,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<Option<SteamAccount>> {
        let row = sqlx::query!(
            r#"
            SELECT
                id,
                patron_id,
                steam_id3,
                created_at,
                deleted_at
            FROM prioritized_steam_accounts
            WHERE id = $1
              AND patron_id = $2
            "#,
            account_id,
            patron_id,
        )
        .fetch_optional(&self.pg_client)
        .await?;

        Ok(row.map(|row| SteamAccount {
            id: row.id,
            patron_id: row.patron_id,
            steam_id3: row.steam_id3,
            created_at: row.created_at,
            deleted_at: row.deleted_at,
        }))
    }

    /// Gets all Steam accounts for a patron, including soft-deleted ones.
    pub(crate) async fn get_accounts_for_patron(
        &self,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<Vec<SteamAccount>> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id,
                patron_id,
                steam_id3,
                created_at,
                deleted_at
            FROM prioritized_steam_accounts
            WHERE patron_id = $1
            ORDER BY created_at ASC
            "#,
            patron_id,
        )
        .fetch_all(&self.pg_client)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| SteamAccount {
                id: row.id,
                patron_id: row.patron_id,
                steam_id3: row.steam_id3,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
            })
            .collect())
    }

    /// Counts active (non-deleted) Steam accounts for a patron.
    #[allow(clippy::cast_possible_truncation)]
    pub(crate) async fn count_active_accounts(
        &self,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<i32> {
        let row = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM prioritized_steam_accounts
            WHERE patron_id = $1
              AND deleted_at IS NULL
            "#,
            patron_id,
        )
        .fetch_one(&self.pg_client)
        .await?;

        // Count will always fit in i32 for practical patron slot limits
        Ok(row.count as i32)
    }

    /// Counts Steam accounts in cooldown (deleted within the last 24 hours) for a patron.
    #[allow(clippy::cast_possible_truncation)]
    pub(crate) async fn count_accounts_in_cooldown(
        &self,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<i32> {
        let cooldown_threshold = Utc::now() - Duration::hours(24);

        let row = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM prioritized_steam_accounts
            WHERE patron_id = $1
              AND deleted_at IS NOT NULL
              AND deleted_at > $2
            "#,
            patron_id,
            cooldown_threshold,
        )
        .fetch_one(&self.pg_client)
        .await?;

        // Count will always fit in i32 for practical patron slot limits
        Ok(row.count as i32)
    }

    /// Checks if a specific `steam_id3` is in cooldown for this patron.
    /// Returns true if the account was soft-deleted within the last 24 hours.
    pub(crate) async fn is_steam_id_in_cooldown(
        &self,
        patron_id: Uuid,
        steam_id3: i64,
    ) -> SteamAccountsRepositoryResult<bool> {
        let cooldown_threshold = Utc::now() - Duration::hours(24);

        let row = sqlx::query!(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM prioritized_steam_accounts
                WHERE patron_id = $1
                  AND steam_id3 = $2
                  AND deleted_at IS NOT NULL
                  AND deleted_at > $3
            ) as "exists!"
            "#,
            patron_id,
            steam_id3,
            cooldown_threshold,
        )
        .fetch_one(&self.pg_client)
        .await?;

        Ok(row.exists)
    }

    /// Finds a soft-deleted Steam account by `steam_id3` for a patron.
    /// Returns the most recently deleted record if one exists.
    pub(crate) async fn find_deleted_account_by_steam_id(
        &self,
        patron_id: Uuid,
        steam_id3: i64,
    ) -> SteamAccountsRepositoryResult<Option<SteamAccount>> {
        let row = sqlx::query!(
            r#"
            SELECT id, patron_id, steam_id3, created_at, deleted_at
            FROM prioritized_steam_accounts
            WHERE patron_id = $1
              AND steam_id3 = $2
              AND deleted_at IS NOT NULL
            ORDER BY deleted_at DESC
            LIMIT 1
            "#,
            patron_id,
            steam_id3,
        )
        .fetch_optional(&self.pg_client)
        .await?;

        Ok(row.map(|row| SteamAccount {
            id: row.id,
            patron_id: row.patron_id,
            steam_id3: row.steam_id3,
            created_at: row.created_at,
            deleted_at: row.deleted_at,
        }))
    }

    /// Adds a new Steam account to a patron's prioritized list.
    pub(crate) async fn add_steam_account(
        &self,
        patron_id: Uuid,
        steam_id3: i64,
    ) -> SteamAccountsRepositoryResult<SteamAccount> {
        let row = sqlx::query!(
            r#"
            INSERT INTO prioritized_steam_accounts (id, patron_id, steam_id3, created_at)
            VALUES (gen_random_uuid(), $1, $2, NOW())
            RETURNING id, patron_id, steam_id3, created_at, deleted_at
            "#,
            patron_id,
            steam_id3,
        )
        .fetch_one(&self.pg_client)
        .await?;

        Ok(SteamAccount {
            id: row.id,
            patron_id: row.patron_id,
            steam_id3: row.steam_id3,
            created_at: row.created_at,
            deleted_at: row.deleted_at,
        })
    }

    /// Soft-deletes a Steam account by setting `deleted_at` to `NOW()`.
    /// Verifies the account belongs to the specified patron.
    pub(crate) async fn soft_delete_account(
        &self,
        account_id: Uuid,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<()> {
        let result = sqlx::query!(
            r#"
            UPDATE prioritized_steam_accounts
            SET deleted_at = NOW()
            WHERE id = $1
              AND patron_id = $2
              AND deleted_at IS NULL
            "#,
            account_id,
            patron_id,
        )
        .execute(&self.pg_client)
        .await?;

        if result.rows_affected() == 0 {
            return Err(SteamAccountsRepositoryError::AccountNotFound);
        }

        Ok(())
    }

    /// Hard-deletes a Steam account (permanently removes from database).
    /// Verifies the account belongs to the specified patron.
    pub(crate) async fn hard_delete_account(
        &self,
        account_id: Uuid,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<()> {
        let result = sqlx::query!(
            r#"
            DELETE FROM prioritized_steam_accounts
            WHERE id = $1
              AND patron_id = $2
            "#,
            account_id,
            patron_id,
        )
        .execute(&self.pg_client)
        .await?;

        if result.rows_affected() == 0 {
            return Err(SteamAccountsRepositoryError::AccountNotFound);
        }

        Ok(())
    }

    /// Reactivates a soft-deleted Steam account by setting `deleted_at` to NULL.
    /// Verifies the account belongs to the specified patron.
    pub(crate) async fn reactivate_account(
        &self,
        account_id: Uuid,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<SteamAccount> {
        let row = sqlx::query!(
            r#"
            UPDATE prioritized_steam_accounts
            SET deleted_at = NULL
            WHERE id = $1
              AND patron_id = $2
              AND deleted_at IS NOT NULL
            RETURNING id, patron_id, steam_id3, created_at, deleted_at
            "#,
            account_id,
            patron_id,
        )
        .fetch_optional(&self.pg_client)
        .await?;

        match row {
            Some(row) => Ok(SteamAccount {
                id: row.id,
                patron_id: row.patron_id,
                steam_id3: row.steam_id3,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
            }),
            None => Err(SteamAccountsRepositoryError::AccountNotFound),
        }
    }

    /// Gets active (non-deleted) Steam accounts for a patron, ordered by `created_at ASC`.
    /// This ordering is useful for soft-deleting oldest accounts first during downgrades.
    pub(crate) async fn get_active_accounts_for_patron(
        &self,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<Vec<SteamAccount>> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id,
                patron_id,
                steam_id3,
                created_at,
                deleted_at
            FROM prioritized_steam_accounts
            WHERE patron_id = $1
              AND deleted_at IS NULL
            ORDER BY created_at ASC
            "#,
            patron_id,
        )
        .fetch_all(&self.pg_client)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| SteamAccount {
                id: row.id,
                patron_id: row.patron_id,
                steam_id3: row.steam_id3,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
            })
            .collect())
    }

    /// Gets soft-deleted Steam accounts for a patron, ordered by `created_at ASC`.
    /// Used to reactivate accounts when a patron re-subscribes.
    pub(crate) async fn get_deleted_accounts_for_patron(
        &self,
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<Vec<SteamAccount>> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id,
                patron_id,
                steam_id3,
                created_at,
                deleted_at
            FROM prioritized_steam_accounts
            WHERE patron_id = $1
              AND deleted_at IS NOT NULL
            ORDER BY created_at ASC
            "#,
            patron_id,
        )
        .fetch_all(&self.pg_client)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| SteamAccount {
                id: row.id,
                patron_id: row.patron_id,
                steam_id3: row.steam_id3,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
            })
            .collect())
    }

    /// Reactivates multiple soft-deleted Steam accounts by setting `deleted_at` to NULL.
    /// Returns the number of accounts that were reactivated.
    pub(crate) async fn reactivate_accounts(
        &self,
        account_ids: &[Uuid],
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<u64> {
        if account_ids.is_empty() {
            return Ok(0);
        }

        let result = sqlx::query!(
            r#"
            UPDATE prioritized_steam_accounts
            SET deleted_at = NULL
            WHERE id = ANY($1)
              AND patron_id = $2
              AND deleted_at IS NOT NULL
            "#,
            account_ids,
            patron_id,
        )
        .execute(&self.pg_client)
        .await?;

        Ok(result.rows_affected())
    }

    /// Soft-deletes multiple Steam accounts by their IDs.
    /// Used during patron downgrades to disable excess accounts.
    /// Returns the number of accounts that were soft-deleted.
    pub(crate) async fn soft_delete_accounts(
        &self,
        account_ids: &[Uuid],
        patron_id: Uuid,
    ) -> SteamAccountsRepositoryResult<u64> {
        if account_ids.is_empty() {
            return Ok(0);
        }

        let result = sqlx::query!(
            r#"
            UPDATE prioritized_steam_accounts
            SET deleted_at = NOW()
            WHERE id = ANY($1)
              AND patron_id = $2
              AND deleted_at IS NULL
            "#,
            account_ids,
            patron_id,
        )
        .execute(&self.pg_client)
        .await?;

        Ok(result.rows_affected())
    }
}
