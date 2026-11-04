CREATE VIEW otel.counter_deltas
COMMENT 'Per-sample increase (delta) of the cumulative counter {metric} in otel_metrics_sum, for TimeUnix in [from_s, to_s] (unix seconds; reads 1 h before from_s for the previous sample). Series = (ServiceName, ResourceAttributes[service.instance.id], Attributes). A series\' first sample counts only if <= 10, a reset counts its full value. Legacy rows (instance api.deadlock-api.com, the API scraped through Caddy until 2026-11-04, gone by 2026-12-04 TTL) interleave two replicas in one series: there a drop starts a run of the lower counter, climbing back past the pre-drop value continues from it, the next drop continues from the lower counter\'s last value, and a reset counts only if <= 10.'
AS SELECT
    TimeUnix,
    ServiceName,
    ResourceAttributes,
    Attributes,
    Value,
    ifNull(if(legacy, multiIf(prev < 0, if(Value <= 10, Value, 0.), Value < prev, if(rlow <= Value, Value - rlow, if(Value <= 10, Value, 0.)), (prev < rdown) AND (Value >= rdown), Value - rdown, Value - prev), multiIf(prev < 0, if(Value <= 10, Value, 0.), Value < prev, Value, Value - prev)), 0.) AS delta
FROM
(
    SELECT
        *,
        anyLast(if((prev >= 0) AND (Value >= prev) AND (prev < rdown) AND (Value >= rdown), prev, NULL)) OVER (PARTITION BY sk ORDER BY TimeUnix ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS rlow
    FROM
    (
        SELECT
            *,
            anyLast(if((prev >= 0) AND (Value < prev), prev, NULL)) OVER (PARTITION BY sk ORDER BY TimeUnix ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rdown
        FROM
        (
            SELECT
                TimeUnix,
                ServiceName,
                ResourceAttributes,
                Attributes,
                Value,
                (ResourceAttributes['service.instance.id']) = 'api.deadlock-api.com' AS legacy,
                cityHash64(ServiceName, ResourceAttributes['service.instance.id'], Attributes) AS sk,
                lagInFrame(Value, 1, -1.) OVER (PARTITION BY sk ORDER BY TimeUnix ASC) AS prev
            FROM otel.otel_metrics_sum
            WHERE (MetricName = {metric:String}) AND (Flags = 0) AND (TimeUnix >= toDateTime64({from_s:UInt32} - 3600, 9)) AND (TimeUnix <= toDateTime64({to_s:UInt32}, 9))
        )
    )
)
WHERE TimeUnix >= toDateTime64({from_s:UInt32}, 9);
