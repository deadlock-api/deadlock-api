CREATE DICTIONARY default.ranked_intervals_dict
(
    `rank_interval` UInt64,
    `sub_rank_xp` Array(UInt32)
)
PRIMARY KEY rank_interval
SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000 USER 'api_readonly_user' PASSWORD '[HIDDEN]' DB 'default' TABLE 'ranked_season_intervals'))
LIFETIME(MIN 600 MAX 900)
LAYOUT(HASHED());
