CREATE VIEW otel.histogram_deltas
COMMENT 'Per-sample bucket/count/sum increase (dc, dcount, dsum) of the cumulative histogram {metric} in otel_metrics_histogram, for TimeUnix in [from_s, to_s] (unix seconds; reads 1 h before from_s). Same series key and reset rules as counter_deltas. Legacy rows (instance api.deadlock-api.com, until 2026-11-04) label Count drop/climb runs like counter_deltas (0 = upper counter, 1 = lower), take deltas within (series, run), and zero samples whose bucket or sum delta would be negative.'
AS SELECT
    TimeUnix,
    ServiceName,
    Attributes,
    ExplicitBounds,
    if(ok, dc0, arrayMap(x -> toInt64(0), dc0)) AS dc,
    if(ok, dcount0, 0) AS dcount,
    if(ok, dsum0, 0.) AS dsum
FROM
(
    SELECT
        *,
        multiIf(pc < 0, if(c <= 10, arrayMap(x -> toInt64(x), BucketCounts), arrayMap(x -> toInt64(0), BucketCounts)), c < pc, if((NOT legacy) OR (c <= 10), arrayMap(x -> toInt64(x), BucketCounts), arrayMap(x -> toInt64(0), BucketCounts)), arrayMap((x, i) -> (toInt64(x) - toInt64(pb[i])), BucketCounts, arrayEnumerate(BucketCounts))) AS dc0,
        multiIf(pc < 0, if(c <= 10, c, 0), c < pc, if((NOT legacy) OR (c <= 10), c, 0), c - pc) AS dcount0,
        multiIf(pc < 0, if(c <= 10, Sum, 0.), c < pc, if((NOT legacy) OR (c <= 10), Sum, 0.), Sum - ps) AS dsum0,
        (NOT legacy) OR ((arrayMin(dc0) >= 0) AND (dsum0 > -0.000001)) AS ok
    FROM
    (
        SELECT
            *,
            lagInFrame(c, 1, toInt64(-1)) OVER w2 AS pc,
            lagInFrame(BucketCounts, 1, CAST([], 'Array(UInt64)')) OVER w2 AS pb,
            lagInFrame(Sum, 1, 0.) OVER w2 AS ps
        FROM
        (
            SELECT
                *,
                if(legacy, ifNull(anyLast(if((prevc >= 0) AND (c < prevc), 1, if((prevc >= 0) AND (c >= prevc) AND (prevc < rdownc) AND (c >= rdownc), 0, NULL))) OVER wc, 0), 0) AS run
            FROM
            (
                SELECT
                    *,
                    anyLast(if((prevc >= 0) AND (c < prevc), prevc, NULL)) OVER wc AS rdownc
                FROM
                (
                    SELECT
                        TimeUnix,
                        ServiceName,
                        Attributes,
                        ExplicitBounds,
                        BucketCounts,
                        Sum,
                        toInt64(Count) AS c,
                        (ResourceAttributes['service.instance.id']) = 'api.deadlock-api.com' AS legacy,
                        cityHash64(ServiceName, ResourceAttributes['service.instance.id'], Attributes) AS sk,
                        lagInFrame(c, 1, toInt64(-1)) OVER (PARTITION BY sk ORDER BY TimeUnix ASC) AS prevc
                    FROM otel.otel_metrics_histogram
                    WHERE (MetricName = {metric:String}) AND (Flags = 0) AND (TimeUnix >= toDateTime64({from_s:UInt32} - 3600, 9)) AND (TimeUnix <= toDateTime64({to_s:UInt32}, 9))
                )
                WINDOW wc AS (PARTITION BY sk ORDER BY TimeUnix ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            )
            WINDOW wc AS (PARTITION BY sk ORDER BY TimeUnix ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        )
        WINDOW w2 AS (PARTITION BY sk, run ORDER BY TimeUnix ASC)
    )
)
WHERE TimeUnix >= toDateTime64({from_s:UInt32}, 9);
