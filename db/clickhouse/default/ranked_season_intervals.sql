CREATE TABLE default.ranked_season_intervals
(
    `rank_interval` UInt32 COMMENT 'Ranked interval, as in match_player.rank_interval and the rank_interval field of CMsgClientToGCGetMatchHistory.',
    `season` LowCardinality(String) COMMENT 'Class name of the season the interval belongs to, e.g. season_2.',
    `season_name` String COMMENT 'Localized season name, e.g. Beta Season 2.',
    `start_time` DateTime COMMENT 'When the interval starts. Matches queued before it can still start up to a few minutes later on the previous interval, so take the interval of a match from its rank_interval column, not from start_time.',
    `end_time` DateTime COMMENT 'When the interval ends.',
    `leaderboard_id` Nullable(UInt32) COMMENT 'Leaderboard of the interval, as in /v1/leaderboard?leaderboard_id.',
    `sub_rank_xp` Array(UInt32) COMMENT 'Rank progress of each subrank step I to VI. A tier spans their sum, and Eternus starts after 10 tiers; rankBadge() turns flat progress into a badge with them.'
)
ENGINE = ReplacingMergeTree
ORDER BY rank_interval
COMMENT 'The ranked intervals of the game files (scripts/ranked_seasons.vdata), one row per interval, refreshed hourly by the update-assets-tables worker. Read through ranked_intervals_dict.';
