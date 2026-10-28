-- Competing salts for one match must coexist until a download proves which is correct, so the
-- salts join the sorting key. Rebuilt rather than altered because ClickHouse rejects adding an
-- existing column to a sorting key ("You can add expressions that use only the newly added
-- columns").
--
-- Apply this before deploying the code that reads verified_at/failed_at. The order is safe in
-- that direction only: the new table still serves the old queries, but the new queries cannot
-- run against the old table.

CREATE TABLE match_salts_rebuilt
(
    match_id      UInt64 CODEC (Delta(8), ZSTD(1)) STATISTICS(tdigest),
    cluster_id    Nullable(UInt32) STATISTICS(tdigest),
    metadata_salt Nullable(UInt32) STATISTICS(tdigest),
    replay_salt   Nullable(UInt32) STATISTICS(tdigest),
    created_at    DateTime DEFAULT now() CODEC (Delta(4), ZSTD(1)),
    username      Nullable(String),
    verified_at   Nullable(DateTime) DEFAULT NULL,
    failed_at     Nullable(DateTime) DEFAULT NULL
)
    engine = CoalescingMergeTree PARTITION BY toStartOfMonth(created_at)
        ORDER BY (toStartOfMonth(created_at), match_id, cluster_id, metadata_salt)
        SETTINGS index_granularity = 8192, allow_nullable_key = 1,
            auto_statistics_types = 'tdigest, minmax, uniq, countmin';

-- A match that reached match_player was downloaded, which proves the salts it was downloaded
-- with. Seeding that verdict leaves only the genuinely unresolved matches for the downloader.
-- force_retry_at is not carried over: it was never read or written anywhere.
INSERT INTO match_salts_rebuilt
    (match_id, cluster_id, metadata_salt, replay_salt, created_at, username, verified_at)
SELECT match_id,
       cluster_id,
       metadata_salt,
       replay_salt,
       created_at,
       username,
       if(match_id IN (SELECT match_id FROM match_player), created_at, NULL)
FROM match_salts;

EXCHANGE TABLES match_salts AND match_salts_rebuilt;

-- Rows that landed in the old table while the copy was running. Re-copying a row that was
-- already carried over is harmless: it coalesces onto the identical key.
INSERT INTO match_salts
    (match_id, cluster_id, metadata_salt, replay_salt, created_at, username, verified_at)
SELECT match_id,
       cluster_id,
       metadata_salt,
       replay_salt,
       created_at,
       username,
       if(match_id IN (SELECT match_id FROM match_player), created_at, NULL)
FROM match_salts_rebuilt
WHERE created_at > now() - INTERVAL 1 DAY;

-- Once the new table has been serving cleanly:
-- DROP TABLE match_salts_rebuilt;
