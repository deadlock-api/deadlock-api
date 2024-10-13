CREATE TABLE IF NOT EXISTS mmr_history
(
 account_id   UInt64,
 match_id     UInt64,
 player_score Float64
) ENGINE = ReplacingMergeTree ORDER BY (account_id, match_id);
