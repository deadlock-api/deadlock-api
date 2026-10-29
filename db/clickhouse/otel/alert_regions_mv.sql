CREATE MATERIALIZED VIEW otel.alert_regions_mv
REFRESH EVERY 5 MINUTE TO otel.alert_regions
(
    `time` DateTime,
    `timeEnd` DateTime,
    `text` String,
    `tags` Array(String)
)
DEFINER = default SQL SECURITY DEFINER
AS WITH
    conds AS
    (
        SELECT
            'APIErrorRate' AS alert,
            300 AS b,
            600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(timestamp) AS t,
                countIf(status_code IN (500, 502, 504)) / count() AS v
            FROM default.request_logs
            WHERE (timestamp >= (now() - toIntervalDay(30))) AND (path NOT LIKE '/v1/matches/{match_id}/metadata%') AND (path NOT IN ('/', '/metrics', '/v1/info/health'))
            GROUP BY t
            HAVING (count() > 100) AND (v > 0.005)
        )
        UNION ALL
        SELECT
            'APITrafficCollapse' AS alert,
            300 AS b,
            600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(timestamp) AS t,
                count() AS v
            FROM default.request_logs
            WHERE timestamp >= (now() - toIntervalDay(30))
            GROUP BY t
            HAVING v < 5000
        )
        UNION ALL
        SELECT
            'MatchIngestStalled' AS alert,
            3600 AS b,
            3600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                t,
                ifNull(mp, 0) AS mp
            FROM
            (
                SELECT
                    toStartOfHour(created_at) AS t,
                    count() AS s
                FROM default.match_salts
                WHERE created_at >= (now() - toIntervalDay(30))
                GROUP BY t
            ) AS b
            LEFT JOIN
            (
                SELECT
                    toStartOfHour(created_at) AS t,
                    count() AS mp
                FROM default.match_player
                WHERE created_at >= (now() - toIntervalDay(30))
                GROUP BY t
            ) AS a USING (t)
            WHERE (ifNull(mp, 0) < 5000) AND (s > 150)
        )
        UNION ALL
        SELECT
            'ClickHouseAppQueryFailures' AS alert,
            900 AS b,
            900 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFifteenMinutes(event_time) AS t,
                count() AS v
            FROM merge(system, '^query_log(_[0-9]+)?$')
            WHERE (event_time >= (now() - toIntervalDay(30))) AND (type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AND (http_user_agent LIKE 'clickhouse-rs%') AND (user != 'api_readonly_user') AND (exception_code NOT IN (394, 735, 236)) AND (exception_code != 159)
            GROUP BY t
            HAVING v >= 10
        )
        UNION ALL
        SELECT
            'ClickHouseQueryTimeouts' AS alert,
            900 AS b,
            1800 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFifteenMinutes(event_time) AS t,
                count() AS v
            FROM merge(system, '^query_log(_[0-9]+)?$')
            WHERE (event_time >= (now() - toIntervalDay(30))) AND (type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AND (http_user_agent LIKE 'clickhouse-rs%') AND (user != 'api_readonly_user') AND (exception_code NOT IN (394, 735, 236)) AND (exception_code = 159)
            GROUP BY t
            HAVING v >= 25
        )
        UNION ALL
        SELECT
            'ClickHouseFailedInserts' AS alert,
            1800 AS b,
            1800 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfInterval(event_time, toIntervalMinute(30)) AS t,
                sum(ProfileEvent_FailedInsertQuery) AS v
            FROM merge(system, '^metric_log(_[0-9]+)?$')
            WHERE event_time >= (now() - toIntervalDay(30))
            GROUP BY t
            HAVING v > 5
        )
        UNION ALL
        SELECT
            'ClickHouseMemoryHigh' AS alert,
            300 AS b,
            600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(event_time) AS t,
                avg(CurrentMetric_MemoryTracking) AS v
            FROM merge(system, '^metric_log(_[0-9]+)?$')
            WHERE event_time >= (now() - toIntervalDay(30))
            GROUP BY t
            HAVING v > 65000000000.
        )
        UNION ALL
        SELECT
            'ClickHouseDiskLow' AS alert,
            300 AS b,
            600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(event_time) AS t,
                min(value) AS v
            FROM merge(system, '^asynchronous_metric_log(_[0-9]+)?$')
            WHERE (metric = 'DiskAvailable') AND (event_time >= (now() - toIntervalDay(30)))
            GROUP BY t
            HAVING v < 500000000000.
        )
        UNION ALL
        SELECT
            'APIDown' AS alert,
            300 AS b,
            300 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(TimeUnix) AS t,
                avg(Value) AS v
            FROM otel.otel_metrics_gauge
            WHERE (MetricName = 'up') AND (Flags = 0) AND (ServiceName = 'api') AND (TimeUnix >= toDateTime64((now() - toIntervalDay(30)), 9)) AND (TimeUnix <= toDateTime64(now(), 9))
            GROUP BY t
            HAVING v < 0.5
        )
        UNION ALL
        SELECT
            'SteamGCOutage' AS alert,
            900 AS b,
            3600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfInterval(TimeUnix, toIntervalSecond(900)) AS t,
                sum(delta) AS v
            FROM
            (
                SELECT
                    TimeUnix,
                    Value,
                    lagInFrame(Value, 1, -1.) OVER (PARTITION BY ServiceName, Attributes ORDER BY TimeUnix ASC) AS prev,
                    multiIf(prev < 0, if(Value <= 10, Value, 0.), Value < prev, Value, Value - prev) AS delta
                FROM otel.otel_metrics_sum
                WHERE (MetricName = 'steam_proxy_call_success') AND (Flags = 0) AND (TimeUnix >= toDateTime64((now() - toIntervalDay(30)) - toIntervalHour(1), 9)) AND (TimeUnix <= toDateTime64(now(), 9))
            )
            WHERE TimeUnix >= toDateTime64((now() - toIntervalDay(30)), 9)
            GROUP BY t
            HAVING v < 400
        )
        UNION ALL
        SELECT
            'IngestFlushFailing' AS alert,
            1800 AS b,
            1800 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfInterval(TimeUnix, toIntervalSecond(1800)) AS t,
                sum(delta) AS v
            FROM
            (
                SELECT
                    TimeUnix,
                    Value,
                    lagInFrame(Value, 1, -1.) OVER (PARTITION BY ServiceName, Attributes ORDER BY TimeUnix ASC) AS prev,
                    multiIf(prev < 0, if(Value <= 10, Value, 0.), Value < prev, Value, Value - prev) AS delta
                FROM otel.otel_metrics_sum
                WHERE (MetricName = 'ingest_worker_batch_flush_failure') AND (Flags = 0) AND (ServiceName = 'ingest-worker') AND (TimeUnix >= toDateTime64((now() - toIntervalDay(30)) - toIntervalHour(1), 9)) AND (TimeUnix <= toDateTime64(now(), 9))
            )
            WHERE TimeUnix >= toDateTime64((now() - toIntervalDay(30)), 9)
            GROUP BY t
            HAVING v >= 2
        )
        UNION ALL
        SELECT
            'ToolFatalErrorSignature' AS alert,
            1800 AS b,
            1800 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfInterval(Timestamp, toIntervalMinute(30)) AS t,
                count() AS v
            FROM otel.otel_logs
            WHERE (Timestamp >= toDateTime64((now() - toIntervalDay(30)), 9)) AND (Timestamp <= toDateTime64(now(), 9)) AND (SeverityText = 'ERROR') AND (ServiceName IN ['active-matches-scraper', 'builds-fetcher', 'demo-analyzer', 'friends-rank-fetcher', 'history-fetcher', 'ingest-worker', 'matchdata-downloader', 'salt-scraper', 'steam-profile-fetcher', 'update-assets-tables']) AND match(Body, '(?i)(failed permanently|Batch insert reported failure|Failed to flush rows|Failed to insert|row type mismatch|not enough data|No such column|Unknown expression|TIMEOUT_EXCEEDED|memory limit exceeded|not enough space|Insert channel closed|Iteration failed|panicked)')
            GROUP BY t
            HAVING v >= 3
        )
        UNION ALL
        SELECT
            'HostMemoryLow' AS alert,
            300 AS b,
            600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(TimeUnix) AS t,
                max(Value) AS v
            FROM otel.otel_metrics_gauge
            WHERE (MetricName = 'node_memory_MemAvailable_bytes') AND (Flags = 0) AND (TimeUnix >= toDateTime64((now() - toIntervalDay(30)), 9)) AND (TimeUnix <= toDateTime64(now(), 9))
            GROUP BY t
            HAVING v < 45000000000.
        )
        UNION ALL
        SELECT
            'HostDiskLow' AS alert,
            300 AS b,
            600 AS mind,
            toDateTime(t) AS t
        FROM
        (
            SELECT
                toStartOfFiveMinutes(TimeUnix) AS t,
                min(Value) AS v
            FROM otel.otel_metrics_gauge
            WHERE (MetricName = 'node_filesystem_avail_bytes') AND (Flags = 0) AND ((Attributes['mountpoint']) IN ('/', '/data')) AND (TimeUnix >= toDateTime64((now() - toIntervalDay(30)), 9)) AND (TimeUnix <= toDateTime64(now(), 9))
            GROUP BY t
            HAVING v < 250000000000.
        )
    ),
    numbered AS
    (
        SELECT
            alert,
            b,
            mind,
            t,
            row_number() OVER (PARTITION BY alert ORDER BY t ASC) AS rn
        FROM conds
    )
SELECT
    min(t) AS time,
    max(t) + b AS timeEnd,
    alert AS text,
    [alert] AS tags
FROM numbered
GROUP BY
    alert,
    b,
    mind,
    t - (b * rn)
HAVING ((max(t) + b) - min(t)) >= mind
ORDER BY time ASC;
