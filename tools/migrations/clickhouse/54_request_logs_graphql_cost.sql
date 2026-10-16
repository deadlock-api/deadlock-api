-- Validated GraphQL complexity and depth per request, written by api/src/middleware/track_requests.rs.
--
-- The API inserts into request_logs by column name, so apply this before deploying the code that
-- writes the columns; the old code keeps working with them present.

ALTER TABLE request_logs
    ADD COLUMN IF NOT EXISTS graphql_complexity Nullable(UInt64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS graphql_depth      Nullable(UInt64) DEFAULT NULL;
