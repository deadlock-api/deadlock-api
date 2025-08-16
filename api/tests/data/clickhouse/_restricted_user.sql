DROP USER IF EXISTS api_readonly_user;
CREATE USER api_readonly_user IDENTIFIED BY 'testing'
    SETTINGS
        readonly = 1, -- Only SELECT queries allowed. No DDL/DML.
        allow_ddl = 0, -- DDL (CREATE, ALTER, DROP, etc.) is disallowed.
        allow_introspection_functions = 0, -- Introspection functions are disabled.
        max_execution_time = 15, -- Max 30 seconds per query.
        max_threads = 5, -- Max 5 threads per query.
        timeout_overflow_mode = 'throw', -- Error thrown if timeout is exceeded.
        max_memory_usage = 5000000000, -- Max 5 GB RAM per query.
        max_memory_usage_for_user = 10000000000, -- Max 10 GB RAM for all concurrent queries by this user.
        max_bytes_before_external_group_by = 0, -- GROUP BY uses only RAM (no disk spill).
        max_bytes_before_external_sort = 0, -- ORDER BY uses only RAM (no disk spill).
        max_result_rows = 100000, -- Max 100,000 rows in result set.
        max_result_bytes = 100000000, -- Max 100 MB result set.
        result_overflow_mode = 'throw', -- Error thrown if result limits are exceeded.
        max_concurrent_queries_for_user = 5 -- Max 5 concurrent queries for this user.
;
GRANT SELECT ON default.* TO api_readonly_user;
GRANT SHOW ON default.* TO api_readonly_user;
REVOKE SELECT ON default.match_salts FROM api_readonly_user;
GRANT SELECT (match_id, cluster_id, metadata_salt, replay_salt, created_at) ON default.match_salts TO api_readonly_user;
