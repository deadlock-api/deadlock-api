CREATE VIEW dump.steam_profiles
(
    `account_id` UInt32,
    `personaname` String,
    `profileurl` String,
    `avatar` String,
    `personastate` Enum8('Offline' = 0, 'Online' = 1, 'Busy' = 2, 'Away' = 3, 'Snooze' = 4, 'LookingToTrade' = 5, 'LookingToPlay' = 6),
    `realname` Nullable(String),
    `countrycode` Nullable(String),
    `last_updated` DateTime,
    `avatarmedium` String,
    `avatarfull` String,
    `friends.account_id` Array(UInt32),
    `friends.friend_since` Array(DateTime)
)
SQL SECURITY INVOKER
AS SELECT
    account_id,
    personaname,
    profileurl,
    avatar,
    personastate,
    realname,
    countrycode,
    last_updated,
    avatarmedium,
    avatarfull,
    `friends.account_id`,
    `friends.friend_since`
FROM default.steam_profiles;
