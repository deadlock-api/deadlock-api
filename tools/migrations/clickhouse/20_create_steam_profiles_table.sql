DROP TABLE IF EXISTS steam_profiles;

CREATE TABLE IF NOT EXISTS steam_profiles
(
 account_id   UInt32,
 personaname  String,
 profileurl   String,
 avatar       String,
 avatarmedium String,
 avatarfull   String,
 personastate Enum8(
  'Offline' = 0,
  'Online' = 1,
  'Busy' = 2,
  'Away' = 3,
  'Snooze' = 4,
  'LookingToTrade' = 5,
  'LookingToPlay' = 6
  ),
 realname     Nullable(String),
 countrycode  Nullable(String),
 last_updated DateTime DEFAULT now() CODEC (Delta, ZSTD)
)
 ENGINE = ReplacingMergeTree()
  ORDER BY account_id;

