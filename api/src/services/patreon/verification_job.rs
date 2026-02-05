use core::sync::atomic::{AtomicBool, Ordering};
use core::time::Duration;
use std::sync::Arc;

use chrono::{TimeDelta, Utc};
use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;
use tokio::time::interval;
use tracing::{error, info, warn};

use super::client::PatreonClient;
use super::membership::handle_downgrade_or_cancellation;
use super::repository::PatronRepository;
use super::steam_accounts_repository::SteamAccountsRepository;
use super::types::Patron;

/// Interval between verification runs (1 hour)
const VERIFICATION_INTERVAL_SECS: u64 = 60 * 60;

/// Patron queued for retry after API error
struct RetryPatron {
    id: uuid::Uuid,
    patreon_user_id: String,
    access_token: String,
    slot_override: Option<i32>,
}

/// Interval for retry on Patreon API errors (30 minutes)
const RETRY_INTERVAL_SECS: u64 = 30 * 60;

/// Hourly verification job for Patreon tokens and membership sync
///
/// This job runs once per hour and:
/// 1. Fetches all patrons with stored tokens
/// 2. For each patron with an expired token, refreshes it using the Patreon API
/// 3. Updates the stored tokens on successful refresh
/// 4. Fetches current membership status and updates patron record
/// 5. Handles patron downgrades by soft-deleting excess Steam accounts
/// 6. Handles patron cancellations by soft-deleting all Steam accounts
/// 7. Logs refresh failures for later re-authentication
/// 8. Retries failed API calls after 30 minutes
pub(crate) struct PatreonVerificationJob {
    patron_repository: PatronRepository,
    steam_accounts_repository: SteamAccountsRepository,
    patreon_client: PatreonClient,
    campaign_id: String,
    shutdown: Arc<AtomicBool>,
    /// Patrons that need retry due to API errors
    retry_queue: Arc<Mutex<Vec<RetryPatron>>>,
}

impl PatreonVerificationJob {
    pub(crate) fn new(
        pg_client: Pool<Postgres>,
        encryption_key: String,
        patreon_client_id: String,
        patreon_client_secret: String,
        patreon_redirect_uri: String,
        campaign_id: String,
    ) -> Self {
        let patron_repository = PatronRepository::new(pg_client.clone(), encryption_key);
        let steam_accounts_repository = SteamAccountsRepository::new(pg_client);
        let patreon_client = PatreonClient::new(
            reqwest::Client::new(),
            patreon_client_id,
            patreon_client_secret,
            patreon_redirect_uri,
        );

        Self {
            patron_repository,
            steam_accounts_repository,
            patreon_client,
            campaign_id,
            shutdown: Arc::new(AtomicBool::new(false)),
            retry_queue: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Start the background verification task
    pub(crate) fn start_background_verification(self: Arc<Self>) {
        // Start the main verification task (runs every 24 hours)
        let job = Arc::clone(&self);
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(VERIFICATION_INTERVAL_SECS));
            info!("Patreon verification job started (runs every hour)");

            loop {
                interval.tick().await;

                if job.shutdown.load(Ordering::Relaxed) {
                    info!("Patreon verification job shutting down");
                    break;
                }

                job.run_verification().await;
            }

            info!("Patreon verification job stopped");
        });

        // Start the retry task (runs every 30 minutes)
        let job = Arc::clone(&self);
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(RETRY_INTERVAL_SECS));
            info!("Patreon retry job started (checks every 30 minutes)");

            loop {
                interval.tick().await;

                if job.shutdown.load(Ordering::Relaxed) {
                    break;
                }

                job.process_retry_queue().await;
            }
        });
    }

    /// Signal shutdown
    #[allow(dead_code)]
    pub(crate) fn signal_shutdown(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }

    /// Run the verification process for all patrons
    async fn run_verification(&self) {
        info!("Starting hourly Patreon verification (tokens + membership)");

        // Fetch all patrons with stored tokens
        let patrons = match self.patron_repository.get_all_patrons_with_tokens().await {
            Ok(patrons) => patrons,
            Err(e) => {
                error!("Failed to fetch patrons for verification: {e}");
                return;
            }
        };

        info!("Found {} patrons to verify", patrons.len());

        let mut refreshed_count = 0;
        let mut membership_synced_count = 0;
        let mut failed_count = 0;
        let mut skipped_count = 0;
        let mut api_error_count = 0;

        for patron in patrons {
            match self.verify_patron(&patron).await {
                VerificationResult::RefreshedAndSynced => {
                    refreshed_count += 1;
                    membership_synced_count += 1;
                }
                VerificationResult::Synced => membership_synced_count += 1,
                VerificationResult::Failed => failed_count += 1,
                VerificationResult::Skipped => skipped_count += 1,
                VerificationResult::ApiError => api_error_count += 1,
            }
        }

        info!(
            "Hourly verification complete: {} tokens refreshed, {} memberships synced, {} failed, {} skipped, {} queued for retry",
            refreshed_count, membership_synced_count, failed_count, skipped_count, api_error_count
        );
    }

    /// Verify a single patron's token and refresh if needed, then sync membership
    async fn verify_patron(&self, patron: &Patron) -> VerificationResult {
        // Get the access token (will be needed for membership sync)
        let Some(ref access_token) = patron.access_token else {
            warn!(
                "Patron {} has no access token, skipping",
                patron.patreon_user_id
            );
            return VerificationResult::Skipped;
        };

        // Refresh token if needed and get the current access token
        let (token_refreshed, current_access_token) = match self.maybe_refresh_token(patron).await {
            TokenRefreshResult::Refreshed(new_token) => (true, new_token),
            TokenRefreshResult::NotNeeded => (false, access_token.clone()),
            TokenRefreshResult::Skipped => return VerificationResult::Skipped,
            TokenRefreshResult::Failed => return VerificationResult::Failed,
        };

        // Sync membership status from Patreon API
        match self
            .sync_membership(
                patron.id,
                &patron.patreon_user_id,
                &current_access_token,
                patron.slot_override,
            )
            .await
        {
            MembershipSyncResult::Success => {
                if token_refreshed {
                    VerificationResult::RefreshedAndSynced
                } else {
                    VerificationResult::Synced
                }
            }
            MembershipSyncResult::ApiError => {
                self.queue_for_retry(
                    patron.id,
                    &patron.patreon_user_id,
                    &current_access_token,
                    patron.slot_override,
                )
                .await;
                VerificationResult::ApiError
            }
            MembershipSyncResult::DbError => VerificationResult::Failed,
        }
    }

    /// Refresh token if expired or expiring soon
    async fn maybe_refresh_token(&self, patron: &Patron) -> TokenRefreshResult {
        let needs_refresh = patron
            .token_expires_at
            .is_none_or(|expires_at| expires_at <= Utc::now() + TimeDelta::hours(1));

        if !needs_refresh {
            return TokenRefreshResult::NotNeeded;
        }

        let Some(ref refresh_token) = patron.refresh_token else {
            warn!(
                "Patron {} has no refresh token, skipping",
                patron.patreon_user_id
            );
            return TokenRefreshResult::Skipped;
        };

        info!(
            "Refreshing token for patron {} (expires: {:?})",
            patron.patreon_user_id, patron.token_expires_at
        );

        match self.patreon_client.refresh_token(refresh_token).await {
            Ok(token_response) => {
                let new_expires_at = Utc::now() + TimeDelta::seconds(token_response.expires_in);

                if let Err(e) = self
                    .patron_repository
                    .update_patron_tokens(
                        patron.id,
                        &token_response.access_token,
                        &token_response.refresh_token,
                        new_expires_at,
                    )
                    .await
                {
                    error!(
                        "Failed to update tokens for patron {}: {e}",
                        patron.patreon_user_id
                    );
                    return TokenRefreshResult::Failed;
                }

                info!(
                    "Successfully refreshed token for patron {}",
                    patron.patreon_user_id
                );
                TokenRefreshResult::Refreshed(token_response.access_token)
            }
            Err(e) => {
                error!(
                    "Failed to refresh token for patron {} (will need to re-authenticate): {e}",
                    patron.patreon_user_id
                );
                TokenRefreshResult::Failed
            }
        }
    }

    /// Sync membership status from Patreon API and update the database.
    /// Also handles patron downgrades and cancellations by soft-deleting excess accounts.
    async fn sync_membership(
        &self,
        patron_id: uuid::Uuid,
        patreon_user_id: &str,
        access_token: &str,
        slot_override: Option<i32>,
    ) -> MembershipSyncResult {
        match self
            .patreon_client
            .get_membership(access_token, &self.campaign_id)
            .await
        {
            Ok(membership) => {
                let (tier_id, pledge_amount_cents, is_active) =
                    Self::extract_membership_data(membership);

                if let Err(e) = self
                    .patron_repository
                    .update_patron_membership(
                        patron_id,
                        tier_id.clone(),
                        pledge_amount_cents,
                        is_active,
                    )
                    .await
                {
                    error!("Failed to update membership for patron {patreon_user_id}: {e}");
                    return MembershipSyncResult::DbError;
                }

                info!(
                    "Successfully synced membership for patron {patreon_user_id} (active: {is_active})"
                );

                // Handle downgrade/cancellation
                if let Err(e) = handle_downgrade_or_cancellation(
                    &self.steam_accounts_repository,
                    patron_id,
                    patreon_user_id,
                    pledge_amount_cents,
                    is_active,
                    slot_override,
                )
                .await
                {
                    error!(
                        "Failed to handle downgrade/cancellation for patron {patreon_user_id}: {e}"
                    );
                    // Don't return DbError here as the membership sync itself succeeded
                }

                MembershipSyncResult::Success
            }
            Err(e) => {
                warn!("Patreon API error for patron {patreon_user_id}, queuing for retry: {e}");
                MembershipSyncResult::ApiError
            }
        }
    }

    /// Extract membership data from Patreon API response
    fn extract_membership_data(
        membership: Option<super::types::Membership>,
    ) -> (Option<String>, Option<i32>, bool) {
        match membership {
            Some(m) => (
                m.tier_id,
                Some(m.pledge_amount_cents),
                m.patron_status.as_deref() == Some("active_patron"),
            ),
            None => (None, Some(0), false),
        }
    }

    /// Queue a patron for retry after Patreon API error
    async fn queue_for_retry(
        &self,
        patron_id: uuid::Uuid,
        patreon_user_id: &str,
        access_token: &str,
        slot_override: Option<i32>,
    ) {
        let mut queue = self.retry_queue.lock().await;
        queue.push(RetryPatron {
            id: patron_id,
            patreon_user_id: patreon_user_id.to_string(),
            access_token: access_token.to_string(),
            slot_override,
        });
    }

    /// Process the retry queue for patrons that had API errors
    async fn process_retry_queue(&self) {
        let patrons_to_retry = {
            let mut queue = self.retry_queue.lock().await;
            core::mem::take(&mut *queue)
        };

        if patrons_to_retry.is_empty() {
            return;
        }

        info!(
            "Processing retry queue: {} patrons to retry",
            patrons_to_retry.len()
        );

        let mut success_count = 0;
        let mut requeued_count = 0;

        for retry_patron in patrons_to_retry {
            match self
                .sync_membership(
                    retry_patron.id,
                    &retry_patron.patreon_user_id,
                    &retry_patron.access_token,
                    retry_patron.slot_override,
                )
                .await
            {
                MembershipSyncResult::Success => {
                    info!(
                        "Retry successful: synced membership for patron {}",
                        retry_patron.patreon_user_id
                    );
                    success_count += 1;
                }
                MembershipSyncResult::ApiError => {
                    warn!(
                        "Retry failed for patron {}, will try again",
                        retry_patron.patreon_user_id
                    );
                    let mut queue = self.retry_queue.lock().await;
                    queue.push(retry_patron);
                    requeued_count += 1;
                }
                MembershipSyncResult::DbError => {
                    // DB error already logged in sync_membership
                }
            }
        }

        info!(
            "Retry queue processed: {} succeeded, {} requeued",
            success_count, requeued_count
        );
    }
}

enum VerificationResult {
    RefreshedAndSynced,
    Synced,
    Failed,
    Skipped,
    ApiError,
}

enum TokenRefreshResult {
    Refreshed(String),
    NotNeeded,
    Skipped,
    Failed,
}

enum MembershipSyncResult {
    Success,
    ApiError,
    DbError,
}
