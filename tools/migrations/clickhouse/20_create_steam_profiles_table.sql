create table steam_profiles
(
    account_id   UInt32 comment 'steam id3',
    personaname  String CODEC(ZSTD(1)),
    profileurl   String CODEC(ZSTD(1)),
    avatar       String CODEC(ZSTD(1)),
    personastate Enum8('Offline' = 0, 'Online' = 1, 'Busy' = 2, 'Away' = 3, 'Snooze' = 4, 'LookingToTrade' = 5, 'LookingToPlay' = 6),
    realname     Nullable(String),
    countrycode  Nullable(String),
    last_updated DateTime default now() CODEC(Delta, ZSTD),
    avatarmedium String CODEC(ZSTD(1)),
    avatarfull   String CODEC(ZSTD(1))
)
    engine = ReplacingMergeTree
        ORDER BY account_id
        SETTINGS index_granularity = 1024, compress_primary_key = 0;
