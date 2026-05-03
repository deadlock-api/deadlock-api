---
name: sql-optimizer
description: Iteratively optimize ClickHouse SQL queries against a real database, comparing variants on structural metrics (read_rows, read_bytes, peak memory, CPU time, wall time) — not just wall clock. Use this skill whenever the user asks to optimize a query, speed up an analytics endpoint, reduce memory of a database query, profile a slow query, compare query variants, or work with a Rust/Python file or API route that contains a query builder. Triggers on phrases like "optimize this query", "make this endpoint faster", "why is this slow", "compare X vs Y", "tune the FINAL/JOIN/GROUP BY", "reduce memory", or any mention of ClickHouse query performance. The skill reads DB creds from .env, accepts either raw SQL or a path to a file / API route containing a query builder, runs structural benchmarks, proposes optimizations one at a time, verifies result equivalence with a hash, and stops when no candidate improves both correctness and structural cost.
---

# SQL Optimizer

Iteratively optimize ClickHouse queries with a structural lens — I/O, memory, CPU, then wall time — and verify that each rewrite preserves results.

## Why structural metrics, not just wall time

Wall time alone is misleading: page cache, file cache, and concurrent load skew it heavily. A change that drops wall time 30% but doubles peak memory will OOM in production. To know whether a rewrite actually wins, look at all of:

- **read_rows / read_bytes** — how much data the query touched. Big drops here usually mean partition / MinMax / granule pruning kicked in.
- **memory_usage** (peak) — set by the heaviest operator (sort, GROUP BY, JOIN, FINAL). Drops here mean the algorithm changed, not just the cache.
- **OSCPUVirtualTimeMicroseconds / UserTimeMicroseconds** (from `system.query_log`) — actual CPU spent. Low CPU + high wall time = blocked on I/O, locks, or coordination.
- **wall time** (≥3 runs after warm-up, mean ± stddev) — bottom line, but only meaningful with the others as context.

State the structural numbers before the wall numbers in every report.

## Scope: query rewrites only

This skill optimizes by **rewriting the query**. It does not propose, suggest, or apply any schema-level change. Off-limits:

- `ALTER TABLE … ADD PROJECTION` / `DROP PROJECTION`
- `CREATE MATERIALIZED VIEW` / `CREATE VIEW`
- `CREATE TABLE` / `CREATE DICTIONARY`
- Adding/changing/removing indexes (skip indexes, bloom filters, primary key)
- Changing engine, ORDER BY, PARTITION BY, TTL, codecs
- Inserting rows, populating projections, or running `OPTIMIZE TABLE`

If the query is fundamentally limited by the schema (e.g. missing the right sort key for the access pattern), say so in the verdict — "no further query-level wins; consider a schema change such as X" — and stop. Don't write the schema change yourself; that's the user's call and a separate workflow.

The bench / equiv scripts only ever issue `SELECT` (and `EXPLAIN` / `SYSTEM FLUSH LOGS`). Anything that mutates state is out.

## Inputs

The skill accepts any of:

1. **A raw SQL string.** Run it directly.
2. **A file path** (e.g. `api/src/routes/v1/analytics/hero_stats.rs`). Read the file, find the query builder (typically a `build_query` fn or a big `format!("…")` block), and reconstruct a representative SQL string by feeding it default/typical parameters. Show the rendered SQL to the user before benchmarking.
3. **An API route** (e.g. `/v1/analytics/hero-stats`). Grep the codebase for the route handler, then proceed as in (2).

For (2)/(3), realistic parameters matter — pick recent timestamps (e.g. last 30 days), `Normal` game mode if the schema has one, and any required filters. Don't run with parameters that return zero rows; the planner behaves differently.

## Workflow

1. **Locate creds.** Read `CLICKHOUSE_HOST`, `CLICKHOUSE_HTTP_PORT`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DBNAME` from `.env` (commonly `<repo>/api/.env` in this codebase). Prefer the read-only user if both `CLICKHOUSE_USERNAME` and `CLICKHOUSE_RESTRICTED_USERNAME` exist. Never echo the password back to the user.

2. **Render and inspect.** Show the rendered SQL. Run `EXPLAIN ESTIMATE` and `EXPLAIN PIPELINE` first — they're free and reveal partition counts, granule counts, and the operator pipeline. Often this alone tells you where the win is.

3. **Baseline.** Use `scripts/bench.sh` to run the query 5 times after a warm-up, capturing `X-ClickHouse-Summary` per run and pulling matching rows from `system.query_log` for CPU/I/O counters. Save baseline metrics.

4. **Propose 2–4 candidates.** Read the query carefully and pick transformations from `references/clickhouse_optimizations.md`. Prefer changes that target a specific structural metric you've identified as the bottleneck — don't fire a shotgun.

5. **Verify equivalence per candidate.** Use `scripts/equiv.sh`, which runs `cityHash64(groupArray(tuple of columns))` over both results and compares. If a transformation uses approximate functions (`uniq`, `quantile*`, `topK`), allow ≤1% delta but call it out explicitly. Never benchmark a candidate before checking equivalence — a faster wrong query is not faster.

6. **Bench each candidate.** Same `bench.sh` invocation as baseline. Build a comparison table.

7. **Iterate.** Pick the best candidate (best structural delta, no regression on memory, equivalent result), make it the new baseline, propose more changes that compose with it, rerun. Stop when no candidate improves the chosen metrics by ≥5%, or the user is satisfied.

## Reporting format

Present every result as a single table, structural metrics first:

| variant | read_rows | read_bytes | peak_mem | cpu_us | wall_ms (n=5) | equivalent |
|---------|-----------|-----------|----------|--------|---------------|------------|
| baseline | … | … | … | … | … ± … | — |
| candidate_A | … (Δ%) | … (Δ%) | … (Δ%) | … (Δ%) | … ± … (Δ%) | yes |

End with a 1–2 sentence verdict and a clear recommendation:
- "Ship variant X — N% less memory, equivalent results."
- "No improvement worth the complexity; keep baseline."

Show absolute numbers and percentage deltas. Don't hide regressions — if memory grew while wall time dropped, say so and let the user decide.

## Equivalence check

Two queries are equivalent if `cityHash64(groupArray(tuple_of_all_output_columns))` matches when both are wrapped in `SELECT … FROM (… ORDER BY <stable key>)`. The `equiv.sh` script handles this. For approximate aggregates, hash a rounded form, e.g. `cityHash64(groupArray((col1, round(approx_col, 3))))`, or compare totals separately and tolerate ≤1% drift.

If equivalence fails, **stop**. Do not proceed to benchmarking. Either the rewrite is wrong, or the original behavior depended on something subtle (NULL ordering, dedup, FINAL semantics) that the user should know about.

## Anti-patterns to avoid

- **Optimizing on a single run.** Variance is high; warm-up and average ≥5 runs.
- **Ignoring memory.** A query that's 30% faster but uses 3× memory is a regression under load.
- **Removing FINAL blindly.** ClickHouse's `FINAL` on a `ReplacingMergeTree` *whose sort key matches the dedup key* is heavily optimized — it streams the merge during read. Hand-rolled `LIMIT 1 BY (sort_key)` or `GROUP BY (sort_key) … any(col)` workarounds typically run 5–10× slower and use more memory because they force a full sort or hash aggregation. Always benchmark before recommending FINAL removal. See `references/clickhouse_optimizations.md` for the FINAL decision tree.
- **Changing semantics silently.** If a transformation changes dedup behavior, NULL handling, JOIN strictness, or aggregate exactness, surface it in the verdict.
- **Trusting the cache.** Two warm-cache runs of the same query can differ 10×. Always run baseline and candidate back-to-back, never separated by minutes of other work.
- **Optimizing the wrong query.** When extracting from a file, confirm the rendered SQL matches what the route actually issues. A `tracing::debug!(?query_str)` in the handler can confirm.
- **Sneaking in a schema change.** Projections, materialized views, new indexes, and engine/ORDER BY changes are explicitly out of scope (see "Scope" above). If a transformation needs one to work, surface the recommendation as text and stop — do not draft DDL or run it.

## Scripts

- `scripts/bench.sh <env_path> <sql_file> <label> [runs=5]` — warm-up + N runs, captures summary headers per run, pulls `system.query_log`, prints per-run JSON and aggregate mean/stddev.
- `scripts/equiv.sh <env_path> <sql_a> <sql_b>` — wraps each in a hash query and compares.
- `scripts/run_query.sh <env_path> <sql_file> [format=Null]` — single-shot for ad-hoc inspection.

All scripts read creds from the `.env` path you pass them; they do not hard-code anything. They print to stderr what they're doing without leaking the password.

## Reference

- `references/clickhouse_optimizations.md` — catalog of transformations with when-to-use, when-not-to, and links to the relevant ClickHouse docs.
