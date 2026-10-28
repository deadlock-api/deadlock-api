-- Add user_deleted flag to distinguish manual deletions from system (downgrade) deletions.
-- Accounts with user_deleted = true should NOT be auto-reactivated by the verification job.
ALTER TABLE prioritized_steam_accounts
    ADD COLUMN IF NOT EXISTS user_deleted boolean NOT NULL DEFAULT false;
