-- Ties a GraphQL request_logs row to its ClickHouse queries: each runs with
-- query_id = '<graphql_request_id>-<n>' (api/src/routes/v1/graphql/mod.rs), so predicted
-- complexity can be compared with system.query_log CPU when re-tuning the cost model
-- (api/src/routes/v1/graphql/cost.rs).
--
-- The API inserts into request_logs by column name: apply before deploying the code.

ALTER TABLE request_logs
    ADD COLUMN IF NOT EXISTS graphql_request_id Nullable(UUID) DEFAULT NULL;
