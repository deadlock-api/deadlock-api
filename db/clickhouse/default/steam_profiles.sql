CREATE TABLE default.steam_profiles
(
    `account_id` UInt32 COMMENT 'steam id3' STATISTICS(tdigest),
    `personaname` String COMMENT 'Current Steam display name; search it (e.g. ILIKE) to find a player\'s account_id. In-game names seen in matches are in steam_profile_observed_names' CODEC(ZSTD(1)),
    `profileurl` String COMMENT 'Steam profile URL: ends in /id/<vanity>/ for a custom URL, else /profiles/<SteamID64>/' CODEC(ZSTD(1)),
    `avatar` String CODEC(ZSTD(1)),
    `personastate` Enum8('Offline' = 0, 'Online' = 1, 'Busy' = 2, 'Away' = 3, 'Snooze' = 4, 'LookingToTrade' = 5, 'LookingToPlay' = 6),
    `realname` Nullable(String),
    `countrycode` Nullable(String),
    `last_updated` DateTime DEFAULT now() CODEC(Delta(4), ZSTD(1)),
    `avatarmedium` String CODEC(ZSTD(1)),
    `avatarfull` String CODEC(ZSTD(1)),
    `friends.account_id` Array(UInt32) DEFAULT [],
    `friends.friend_since` Array(DateTime) DEFAULT [],
    `personaname_lc` String MATERIALIZED lowerUTF8(personaname),
    INDEX idx_personaname_ngram personaname_lc TYPE ngrambf_v1(3, 8192, 3, 0) GRANULARITY 4
)
ENGINE = ReplacingMergeTree
ORDER BY account_id
SETTINGS index_granularity = 256, compress_primary_key = 0, deduplicate_merge_projection_mode = 'throw', min_compress_block_size = 8192, max_compress_block_size = 16384;
