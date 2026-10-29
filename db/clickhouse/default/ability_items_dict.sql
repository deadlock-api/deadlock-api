CREATE DICTIONARY default.ability_items_dict
(
    `id` UInt64
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000 USER 'api_readonly_user' PASSWORD '[HIDDEN]' DB 'default' QUERY 'SELECT DISTINCT id FROM items WHERE type = \'ability\''))
LIFETIME(MIN 600 MAX 900)
LAYOUT(HASHED());
