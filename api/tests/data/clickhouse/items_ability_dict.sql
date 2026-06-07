DROP DICTIONARY IF EXISTS default.ability_items_dict;

CREATE DICTIONARY default.ability_items_dict
(
    id UInt64
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(
    HOST 'localhost'
    PORT 9000
    USER 'default'
    PASSWORD 'ijojdmkasd'
    DB 'default'
    QUERY 'SELECT DISTINCT id FROM items WHERE type = ''ability'''
))
LAYOUT(HASHED())
LIFETIME(MIN 600 MAX 900);
