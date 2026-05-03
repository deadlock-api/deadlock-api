# ClickHouse Query Optimization Catalog

Read this when proposing rewrites. Every entry is a transformation with the structural metric it targets, when it usually wins, and when it usually loses.

**Scope reminder:** this skill only rewrites queries. Schema-level changes (projections, materialized views, new indexes, engine/ORDER BY/PARTITION BY changes) are out of scope. Entries below that mention them are listed for context only — surface them as a textual recommendation if needed, but do not draft DDL or run it.

## How to read this

- **Targets** — the structural metric most likely to move.
- **When to use** — concrete trigger conditions you should see in the query or the `EXPLAIN` output.
- **When NOT to use** — the trap. These are the cases where the "obvious" rewrite is a regression.
- **Verify** — what to specifically check in the bench to confirm the win.

---

## 1. Predicate pushdown into subqueries / CTEs

**Targets:** read_rows, read_bytes (huge wins from partition / MinMax pruning).

**Pattern:**
```sql
-- Before: filter applied after the join
FROM big_table
INNER JOIN small_filter USING (id)

-- After: predicate pushed down so big_table can prune
FROM big_table
INNER JOIN small_filter USING (id)
WHERE id IN (SELECT id FROM small_filter)  -- yes, both — see below
```

**When to use:** the outer filter narrows down a column that's part of the *partition key* or *primary key* of the inner table. JOIN alone doesn't always trigger pruning; an explicit `IN (SELECT …)` does, because the planner sees it as a deterministic filter.

**When NOT to use:** when the right-hand side of the IN is huge and not already materialized — you'll just shift the cost. Combine with a CTE or a small reference table.

**Verify:** read_rows on the big table drops by the same ratio as the filter selectivity. Check `SelectedParts` and `SelectedMarks` in `system.query_log`.

---

## 2. FINAL on ReplacingMergeTree

**Targets:** correctness (dedup); FINAL is *cheap* when the table's sort key matches the dedup key.

**FINAL decision tree:**

1. Is the table a `ReplacingMergeTree` / `CollapsingMergeTree` / `VersionedCollapsingMergeTree`? If no, FINAL is irrelevant.
2. Does its `ORDER BY` exactly match the dedup key (i.e. the natural row identity)? If yes, **FINAL is a streaming merge during read** — it's typically the *fastest* way to dedupe and almost always beats hand-rolled alternatives.
3. Are duplicates rare in practice (well-merged background)? Same answer — FINAL is cheap.

**Hand-rolled dedup that often loses to FINAL:**
- `LIMIT 1 BY (sort_key)` — forces a sort step on top of the read.
- `GROUP BY (sort_key) … any(col)` — forces hash aggregation.
- `argMax(col, version) GROUP BY (sort_key)` — same as above plus a comparator.

**When hand-rolled dedup might win:**
- The table has no FINAL-friendly engine.
- You're already doing a GROUP BY on (sort_key) for other reasons; absorb the dedup into it.
- You're filtering down to a tiny subset where the FINAL cost (still a per-part merge) is dominated by other work.

**Verify:** benchmark both. The wall-time delta is usually 5–10× one way or the other; trust the numbers, not intuition.

**Real example from this codebase:** `match_player` is `ReplacingMergeTree ORDER BY (match_id, account_id)`. Replacing `FROM match_player FINAL` with `FROM (SELECT … FROM match_player WHERE … LIMIT 1 BY match_id, account_id)` regressed wall time from ~1.0s to ~12.4s and peak memory from 942 MB to 2.6 GB on a 30-day window. FINAL stayed.

---

## 3. count(distinct …) → uniq() / uniqExact()

**Targets:** memory, wall time.

**Pattern:**
```sql
-- Before
SELECT count(distinct user_id) FROM events

-- After (approximate, ~1% error)
SELECT uniq(user_id) FROM events

-- After (exact, but uses HashSet)
SELECT uniqExact(user_id) FROM events
```

**When to use:** anywhere a true distinct count isn't required. `uniq` uses HyperLogLog and is dramatically cheaper memory-wise.

**When NOT to use:** when downstream code multiplies/divides by the count and needs exactness. Always document the swap in the verdict.

**Verify:** memory drops, result is within ~1%.

---

## 4. JOIN order — small/dimension on the right

**Targets:** memory (build side of hash join).

**Pattern:** ClickHouse's default join algorithm builds a hash table on the *right* side. Put the smaller side on the right, the streaming/larger side on the left. If the planner doesn't reorder for you (it sometimes won't with subqueries), do it yourself.

**Verify:** memory_usage drops; `JoinedRows` in ProfileEvents matches what you'd expect.

**Related:** `SETTINGS join_algorithm = 'partial_merge'` for very large right sides that don't fit in memory; `'parallel_hash'` for parallelism.

---

## 5. optimize_read_in_order / optimize_aggregation_in_order

**Targets:** memory, wall time on top-N or aggregate-by-prefix queries.

**Pattern:**
```sql
SELECT match_id, account_id, any(hero_id)
FROM match_player
GROUP BY match_id, account_id
SETTINGS optimize_aggregation_in_order = 1
```

**When to use:** the GROUP BY (or ORDER BY) prefix matches the table's sort key. The engine can stream-aggregate without a hash table.

**When NOT to use:** the GROUP BY columns aren't a sort-key prefix — the setting is ignored or actively slower (it forces a sort).

**Verify:** memory_usage drops sharply (no hash table); wall time may stay similar but I/O patterns smooth out.

---

## 6. Replace correlated subqueries with JOINs (or vice versa)

**Targets:** wall time, depending on direction.

**Subquery → JOIN** when the subquery is being re-executed per outer row (rare in CH but happens with parameter substitution).

**JOIN → IN-subquery** when:
- The JOIN forces a hash table that won't fit.
- You only need the existence of a matching row, not its columns.
- You want partition pruning (see #1).

**Verify:** plan in `EXPLAIN PIPELINE` should show one fewer hash-join step.

---

## 7. ARRAY JOIN over multiple correlated arrays

**Targets:** wall time, code clarity.

**Pattern:**
```sql
ARRAY JOIN
    items.item_id AS item_id,
    items.game_time_s AS buy_time
```

When you need to expand a row by parallel nested arrays, ARRAY JOIN is far cheaper than a UNION of two separate scans of the same row.

---

## 8. Materialize intermediate sets via CTE

**Targets:** wall time when the same subquery is referenced multiple times.

ClickHouse's CTEs (`WITH t AS (…)`) are *not* automatically materialized — they may be inlined into each reference, doubling the scan. When the inner work is expensive, force materialization:

```sql
WITH t_matches AS (
    SELECT match_id FROM match_info WHERE … SETTINGS … 
)
```

Or use a temporary `LIMIT N`-bounded subquery whose plan visibly executes once.

For ClickHouse ≥ 23, `SETTINGS use_query_cache = 1` plus a deterministic query yields cross-query caching too.

---

## 9. Avoid `SELECT *` over wide tables

**Targets:** read_bytes.

ClickHouse is columnar — only the columns you SELECT are read. Wide tables (like `match_player` with 100+ columns including arrays) are punished hard by `SELECT *`. Always project only what you need, even in subqueries.

**Verify:** read_bytes drops in proportion to (cols read / total cols), roughly.

---

## 10. PREWHERE for cheap-filter columns

**Targets:** read_bytes when the filter column is small and selective.

```sql
-- Before
WHERE cheap_col = 5 AND expensive_col = 'foo'

-- After
PREWHERE cheap_col = 5
WHERE expensive_col = 'foo'
```

CH applies PREWHERE before reading other columns from disk. The optimizer often does this automatically; check `EXPLAIN` to see if it didn't, and force it manually if so.

**When NOT to use:** the "cheap" column isn't actually selective. Then PREWHERE costs more than it saves.

---

## 11. Approximate functions for percentiles

**Targets:** memory, wall time.

`quantile(level)(x)` (default, t-digest) vs `quantileExact(level)(x)` — the former is O(1) memory; the latter materializes all values.

**When NOT to use:** small input where quantileExact is fine and you want exactness; or when you're going to feed the result into a downstream calculation that's sensitive to the approximation.

---

## 12. Projections (storage-level) — OUT OF SCOPE for this skill

If a query repeatedly aggregates by a non-primary-key column, a projection (`ALTER TABLE … ADD PROJECTION`) can give 10–100× wins by pre-aggregating at write time.

**This skill does not create or modify projections.** It is a schema change. If benchmarking shows the query is fundamentally limited by full-table scans on a non-sort-key column, surface this as a recommendation in the verdict — e.g. "remaining wins require a projection on `column_x`; out of scope here" — and stop. Do not draft the DDL.

The same applies to **materialized views**, **new skip indexes**, **codec changes**, and **engine/ORDER BY/PARTITION BY rewrites** — recommend in text only.

---

## 13. Cardinality-aware GROUP BY

When grouping by a high-cardinality column, the hash table dominates memory. Options:
- `SETTINGS max_bytes_before_external_group_by = N` to spill to disk on overflow.
- Pre-aggregate within partitions, then merge.
- Drop the high-cardinality column from the GROUP BY if it's only there for display (use `any()` aggregator).

---

## 14. Stop trusting EXPLAIN ESTIMATE blindly

`EXPLAIN ESTIMATE` reports estimated rows/bytes from index granules — useful for comparing alternatives, but actual reads can be much smaller (PREWHERE) or much larger (skipping indexes that didn't help). Cross-check with the post-execution `system.query_log` row.

---

## Useful CH docs

- `https://clickhouse.com/docs/sql-reference/statements/select/from#final-modifier`
- `https://clickhouse.com/docs/operations/system-tables/query_log`
- `https://clickhouse.com/docs/optimize/skipping-indexes`
- `https://clickhouse.com/docs/sql-reference/statements/explain`
- `https://clickhouse.com/docs/data-modeling/projections`
