# `pending_matches` queue — migration plan

## Goal

Replace the 10-second, 617M-row `salt_scraper_pmh_full_pending_matches` LEFT ANTI JOIN with a sub-millisecond key lookup against a small, self-maintaining queue table. Same semantics, drastically lower cost, and the cost stays flat as `player_match_history` / `match_player` keep growing.

The query becomes:

```sql
SELECT match_id
FROM pending_matches FINAL
WHERE state = 'pending'
  AND match_id >= 31247321
ORDER BY match_id DESC
LIMIT 100
```

Expected steady-state size of the queue: a few thousand rows (only the matches currently missing salts/players); total table size in the low MiB range.

---

## Design

### Table

`ReplacingMergeTree`, keyed by `match_id`, holding one logical row per match. The state column is `Enum8('pending' = 0, 'done' = 1)`. We use `ReplacingMergeTree` (not `CollapsingMergeTree`) because:

- Updates are idempotent: any number of "done" inserts converge to "done".
- The dedup key matches the query key, so `FINAL` is cheap (granule-merging during read).
- No need to track sign / +1 -1 — simpler write path for three independent writers.

```sql
CREATE TABLE pending_matches
(
    match_id    UInt64 CODEC (Delta, ZSTD),
    state       Enum8('pending' = 0, 'done' = 1),
    updated_at  DateTime DEFAULT now() CODEC (Delta, ZSTD)
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY intDiv(match_id, 10000000)   -- ~10M matches per partition; small partitions allow cheap drop of fully-done old data
ORDER BY match_id
SETTINGS index_granularity = 8192;
```

`updated_at` is the version column for `ReplacingMergeTree` — newer wins on merge. This handles out-of-order inserts (a "done" arriving before its "pending" still wins because it has a later `updated_at`).

> NB: `updated_at` is not a substitute for the version column on the *write side*. Any insert that wants to set state=done must use `now()` so that it dominates an earlier `state=pending` row.

### Write paths (three places)

The key invariant: **a match is "pending" iff it is in pmh but not in (`match_salts` ∪ `match_player`).**

We maintain that invariant by inserting into `pending_matches` from each source table via a materialized view:

1. **From `player_match_history`** → insert `(match_id, 'pending', start_time)`.
   The MV runs on every block written to pmh. `start_time` is used as `updated_at` so a later `'done'` insert with `updated_at = now()` wins.
2. **From `match_salts`** → insert `(match_id, 'done', created_at)`.
3. **From `match_player`** → insert `(match_id, 'done', now())`.

`match_player` and `match_salts` MVs may produce many rows per match (match_player has ~12 rows/match). That's fine — `ReplacingMergeTree` collapses them on merge / `FINAL`.

### Why the query is fast

After the migration:

- Total queue size: ~10k–100k rows in the worst case (all currently-pending matches).
- Sort key is exactly the query's `ORDER BY` key.
- `FINAL` on `ReplacingMergeTree` whose dedup key matches the sort key streams the merge during read — no full sort, no hash table.
- The `state = 'pending'` filter eliminates the merged-to-done rows in the same scan.
- Reading 100 rows from a sub-MiB table sorted by `match_id`: well under 1 ms.

---

## Rollout phases

### Phase 0 — schema + MVs (deploy, no reader changes yet)

Migration file: `tools/migrations/clickhouse/27_create_pending_matches_queue.sql`.

```sql
-- Table
CREATE TABLE IF NOT EXISTS pending_matches
(
    match_id    UInt64 CODEC (Delta, ZSTD),
    state       Enum8('pending' = 0, 'done' = 1),
    updated_at  DateTime DEFAULT now() CODEC (Delta, ZSTD)
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY intDiv(match_id, 10000000)
ORDER BY match_id
SETTINGS index_granularity = 8192;

-- MV: pmh → pending
CREATE MATERIALIZED VIEW IF NOT EXISTS pending_matches_from_pmh_mv
TO pending_matches AS
SELECT
    match_id,
    'pending' AS state,
    start_time AS updated_at
FROM player_match_history
WHERE match_mode IN ('Ranked', 'Unranked')
  AND match_id >= 31247321;

-- MV: match_salts → done
CREATE MATERIALIZED VIEW IF NOT EXISTS pending_matches_from_salts_mv
TO pending_matches AS
SELECT
    match_id,
    'done' AS state,
    created_at AS updated_at
FROM match_salts
WHERE match_id >= 31247321 AND match_id < 4294967295;

-- MV: match_player → done
CREATE MATERIALIZED VIEW IF NOT EXISTS pending_matches_from_match_player_mv
TO pending_matches AS
SELECT
    match_id,
    'done' AS state,
    now() AS updated_at
FROM match_player
WHERE match_id >= 31247321;
```

After deploy, `pending_matches` only fills with rows from *new* writes. Phase 1 backfills history.

### Phase 1 — backfill historical state

Two `INSERT … SELECT`s, run once. They can be done at any time after Phase 0 — the MVs are already capturing live writes, so this only fills the gap for rows that existed before deploy.

```sql
-- Backfill pending: every distinct pmh match_id in scope, marked pending with start_time.
INSERT INTO pending_matches (match_id, state, updated_at)
SELECT
    match_id,
    'pending' AS state,
    min(start_time) AS updated_at
FROM player_match_history
WHERE match_mode IN ('Ranked', 'Unranked')
  AND match_id >= 31247321
GROUP BY match_id
SETTINGS max_threads = 8, max_memory_usage = 8000000000;

-- Backfill done from salts. updated_at = now() so it wins over any pending row above.
INSERT INTO pending_matches (match_id, state, updated_at)
SELECT
    match_id,
    'done' AS state,
    now() AS updated_at
FROM match_salts
WHERE match_id >= 31247321 AND match_id < 4294967295
GROUP BY match_id;

-- Backfill done from match_player.
INSERT INTO pending_matches (match_id, state, updated_at)
SELECT
    match_id,
    'done' AS state,
    now() AS updated_at
FROM match_player
WHERE match_id >= 31247321
GROUP BY match_id;

-- Force the merges so the first read isn't slow.
OPTIMIZE TABLE pending_matches FINAL;
```

Run order matters: pending first (so the `done` rows have a strictly larger `updated_at` and dominate). Both `done` backfills can be parallel.

The pending backfill reads all 196M relevant pmh rows and aggregates to ~20M distinct match_ids — biggest cost of the migration, ~10–30s with the suggested `max_threads`. The done backfills are small (~16M and ~20M unique keys).

### Phase 2 — verify correctness

Before any reader switches over, prove the queue agrees with the legacy query:

```sql
-- Should return the SAME 100 match_ids as the legacy fallback.
SELECT match_id
FROM pending_matches FINAL
WHERE state = 'pending' AND match_id >= 31247321
ORDER BY match_id DESC
LIMIT 100;

-- Sanity: how many pending vs done overall?
SELECT state, count() FROM pending_matches FINAL GROUP BY state;

-- Sanity: any pending row whose match_id is actually in match_salts or match_player?
SELECT count()
FROM pending_matches FINAL
WHERE state = 'pending'
  AND (match_id IN (SELECT match_id FROM match_salts WHERE match_id < 4294967295)
    OR match_id IN (SELECT match_id FROM match_player));
-- Expected: 0. Anything > 0 means an MV is misfiring or the backfill ordering broke.
```

A small non-zero count from the third check is expected during the racey window right around backfill (rows arriving between the salts/player backfill and the pending backfill). Rerunning `OPTIMIZE TABLE pending_matches FINAL;` and re-checking should drop it to zero.

### Phase 3 — switch the reader

In `tools/salt-scraper/src/main.rs`:

- Replace the `pmh_full_fut` SQL (lines 198–222) with:
  ```sql
  SELECT match_id
  FROM pending_matches FINAL
  WHERE state = 'pending' AND match_id >= 31247321
  ORDER BY match_id DESC
  LIMIT 100
  SETTINGS log_comment = 'salt_scraper_pmh_full_pending_matches'
  ```
- Replace `active_full_fut` (lines 223–245) with the same query (or, equivalently, keep one `pmh_full_fut` and drop `active_full_fut` entirely — the queue is the union of both sources, so a single read covers both).
- Drop the `pmh_empty` / `active_empty` gating around the fallbacks. The new query is cheap enough to always run.
- Adjust the `PendingMatch` deserialization for the fallback to a `match_id`-only struct and synthesize `participants: Vec::new()`. (This is the same Rust change recommended for variant F earlier — confirmed safe because `prio_fut` independently returns prioritized matches with their real participants and the dedup at line 259 keeps the prio version.)

The `pmh_fast` and `prio_fut` queries do not need to change (yet — see Phase 5).

### Phase 4 — observe

Leave the legacy query in `system.query_log` filterable via `log_comment` and watch for a week:

```sql
SELECT
    log_comment,
    count(),
    avg(query_duration_ms),
    quantile(0.99)(query_duration_ms),
    avg(memory_usage),
    avg(read_rows)
FROM system.query_log
WHERE event_time > now() - INTERVAL 7 DAY
  AND log_comment IN ('salt_scraper_pmh_full_pending_matches', 'salt_scraper_active_full_pending_matches')
  AND type = 'QueryFinish'
GROUP BY log_comment;
```

Expected: `query_duration_ms` p99 < 50ms, `read_rows` < 100k, `memory_usage` < 50MB.

### Phase 5 (optional) — collapse the fast path too

Once the queue is trusted, the fast-path queries (`pmh_fast`, `active_fast`, lines 123–162) and the prioritized-account query (`prio_fut`, lines 87–117) all become single-table reads:

```sql
-- replaces pmh_fast and active_fast both
SELECT match_id FROM pending_matches FINAL
WHERE state = 'pending' AND match_id >= 31247321
ORDER BY match_id DESC LIMIT 100;

-- replaces prio_fut: needs the participant-account dimension, which the queue doesn't have.
-- Either keep prio_fut as-is, or extend pending_matches with a participants column.
```

The prioritized-account path is the awkward one because it filters by `pmh.account_id IN (...)`. Two options:

- **A)** Keep `prio_fut` as-is — it's already bounded by the prioritized-account list and runs against pmh's natural sort key, so it's already cheap.
- **B)** Add a `pending_match_accounts` table (one row per (match_id, account_id) for pending matches), populated by an MV from pmh and pruned by an MV from match_salts/match_player. This is more invasive and probably not worth it unless the prioritized list grows large.

Recommendation: option A. Leave `prio_fut` alone.

---

## Risks & mitigations

| risk | mitigation |
|---|---|
| MV insert order isn't atomic — a `done` row from match_player could arrive before the corresponding `pending` from pmh, then the later pending insert overwrites it as pending. | The `updated_at` version column protects against this: if `done` was inserted with `now()` at time T1 and `pending` is inserted with `start_time` (which is always < T1 for any real match), the `done` row dominates after merge. The 2-hour delay (`pmh.start_time < now() - 2h`) in the read query also helps — by the time we look, all writes have settled. |
| Backfill produces a momentary inconsistency — pending rows for matches that already have salts/players, until the done backfills land. | Backfill order: pending first, then done. Run `OPTIMIZE TABLE pending_matches FINAL` after. Skip Phase 3 until Phase 2 verification passes. |
| MV write amplification — every match_player insert (24 rows/match avg) triggers 24 inserts into pending_matches. | Acceptable: each row is ~16 bytes; even at 10k matches/hour × 24 = 240k rows/hour, the table grows ~4 MiB/hour pre-merge. Replacing collapses it within minutes. |
| `match_salts` has garbage `match_id` values up to ~3.7e18 (per the comment at main.rs:32). | The MV's `WHERE match_id < 4294967295` filter strips them. |
| `pending_matches_from_match_player_mv` may pick up rows for matches that were never in pmh (if data is ingested in odd orders). | Harmless — they're inserted as `done` and never visible to the reader (the reader filters `state = 'pending'`). Storage cost is bounded by match_player size. |
| `FINAL` performance regresses if part count grows. | `pending_matches` is small. Set `OPTIMIZE TABLE pending_matches FINAL` to run nightly via cron, or rely on natural background merges. With ~10k rows the table never gets above a handful of parts. |
| Old "done" rows accumulate forever. | Partition is `intDiv(match_id, 10000000)` — drop-old-partitions becomes trivial. After confirming all matches in a partition are `done` and old, `ALTER TABLE pending_matches DROP PARTITION N`. Optional cleanup, not critical. |
| Schema migration breaks if MV creation runs against an empty target table during a deploy where pmh is being actively written. | MV creates atomically — no race with writers. The row of writes between Phase 0 and Phase 1 is captured by the live MV. |

---

## Estimated effort

| step | effort |
|---|---|
| Migration SQL (Phase 0) | 30 min — write + review |
| Backfill (Phase 1) | 1 hour to run (mostly waiting); 10 min to write |
| Verification (Phase 2) | 30 min |
| Reader switch (Phase 3) | 1–2 hours — Rust diff + testing |
| Observation (Phase 4) | 1 week wall, ~0 active effort |
| Fast-path collapse (Phase 5) | optional, 1–2 hours if pursued |

Total active work: under a day. The week-long observation phase is so the legacy query stays runnable as a fallback in case the queue is wrong somehow.

---

## What this does NOT solve

- **Doesn't help `prio_fut`** — that one filters by account_id, which isn't in the queue.
- **Doesn't change `match_player` / `pmh` / `match_salts` themselves** — no migration of the data tables, no projection changes, no sort key changes.
- **Doesn't reduce ingest rate** — the MVs add a small constant write cost per insert.

The intent is narrow: make the "find missing matches" question O(answer_size) instead of O(history_size), which is the right shape for a queue.
