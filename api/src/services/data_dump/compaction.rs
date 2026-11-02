//! Pure planning over the manifest: which partitions to rebuild, which hourly deltas to fold,
//! which files are fully covered by bases and can go.
//!
//! Invariant every step preserves, per generation: a row with `watermark = t` in partition
//! `p` is in `base(p)` if `t <= base(p).hi`, otherwise in exactly one live delta or residual
//! whose `(lo, hi]` contains `t`. Only watermarks are compared, never wall-clock time.

use std::collections::BTreeMap;

use super::manifest::{FileKind, TableState};

/// The zone's plan (Pro) edge-caches objects up to 512 MB; bigger ones bypass the cache, so
/// every ranged read of them is an R2 Class B operation. A base file over this is split again.
pub(crate) const MAX_FILE_BYTES: u64 = 500_000_000;
/// What base files aim for, leaving room for estimate error and uneven bytes per row.
pub(crate) const TARGET_FILE_BYTES: u64 = 400_000_000;
/// Bytes per row before the table has any base (`match_player` had ~1.6 kB in 2026-11).
const DEFAULT_BYTES_PER_ROW: u64 = 2_000;
const MAX_CHUNKS: u64 = 256;

/// Half-open range `[from, to)` of a partition's chunk column (`None` is unbounded) that one
/// base file holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) struct Chunk {
    pub(crate) from: Option<u64>,
    pub(crate) to: Option<u64>,
}

impl Chunk {
    /// Consecutive chunks covering `self`, cut at the `bounds` strictly inside it.
    pub(crate) fn split(self, bounds: &[u64]) -> Vec<Self> {
        let mut inner: Vec<u64> = bounds
            .iter()
            .copied()
            .filter(|&b| self.from.is_none_or(|f| b > f) && self.to.is_none_or(|t| b < t))
            .collect();
        inner.sort_unstable();
        inner.dedup();
        let mut chunks = Vec::with_capacity(inner.len().saturating_add(1));
        let mut from = self.from;
        for b in inner {
            chunks.push(Self { from, to: Some(b) });
            from = Some(b);
        }
        chunks.push(Self { from, to: self.to });
        chunks
    }
}

/// How many files `bytes` of base should be split into.
pub(crate) fn chunk_count(bytes: u64) -> usize {
    let n = bytes.div_ceil(TARGET_FILE_BYTES).clamp(1, MAX_CHUNKS);
    usize::try_from(n).unwrap_or(1)
}

/// Expected base size of `partition` with `rows` rows, from the bytes per row of its previous
/// base (any generation), else of the table's other bases.
pub(crate) fn estimate_base_bytes(table: &TableState, partition: u64, rows: u64) -> u64 {
    let sum = |own: bool| {
        table
            .files
            .iter()
            .filter(|f| f.kind == FileKind::Base && (!own || f.partition == Some(partition)))
            .fold((0u64, 0u64), |(b, r), f| {
                (b.saturating_add(f.bytes), r.saturating_add(f.rows))
            })
    };
    let (bytes, base_rows) = match sum(true) {
        (_, 0) => sum(false),
        own => own,
    };
    if base_rows == 0 {
        return rows.saturating_mul(DEFAULT_BYTES_PER_ROW);
    }
    u128::from(rows)
        .saturating_mul(u128::from(bytes))
        .checked_div(u128::from(base_rows))
        .and_then(|b| u64::try_from(b).ok())
        .unwrap_or(u64::MAX)
}

pub(crate) struct Params {
    /// Partitions rebuilt per tick.
    pub(crate) budget: usize,
    /// Rebuild once pending rows exceed `max(base.rows / threshold_divisor, threshold_min)`.
    pub(crate) threshold_divisor: u64,
    pub(crate) threshold_min: u64,
    /// The newest this many partitions never rebuild for backlog: they keep taking rows, and
    /// the hourly deltas already cover them. They still rebuild when missing, drifted or old.
    pub(crate) skip_pending_newest: usize,
    /// Rolling refresh: rebuild bases older than this (seconds of watermark time).
    pub(crate) max_base_age_secs: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Reason {
    Missing,
    Pending,
    Drift,
    Rolling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Rebuild {
    pub(crate) partition: u64,
    pub(crate) reason: Reason,
}

/// Rows in live deltas/residuals for `partition` that no base of `generation` covers yet.
pub(crate) fn pending_rows(table: &TableState, generation: u32, partition: u64) -> u64 {
    let base_hi = table.base(generation, partition).and_then(|b| b.hi);
    table
        .increments(generation)
        .filter(|f| base_hi.is_none_or(|base_hi| f.hi.is_some_and(|hi| hi > base_hi)))
        .filter_map(|f| f.rows_by_partition.get(&partition))
        .sum()
}

/// Picks up to `params.budget` partitions to rebuild, most urgent first.
///
/// `actual` maps every partition currently in `ClickHouse` to its raw row count (the probe);
/// `watermark_hi` is the table's current watermark.
pub(crate) fn plan_rebuilds(
    table: &TableState,
    generation: u32,
    actual: &BTreeMap<u64, u64>,
    watermark_hi: i64,
    params: &Params,
) -> Vec<Rebuild> {
    let mut plan: Vec<Rebuild> = Vec::new();
    let mut push = |partition: u64, reason: Reason| {
        if plan.len() < params.budget && !plan.iter().any(|r| r.partition == partition) {
            plan.push(Rebuild { partition, reason });
        }
    };

    for &p in actual.keys() {
        if table.base(generation, p).is_none() {
            push(p, Reason::Missing);
        }
    }
    // Largest backlog first so hot partitions never starve behind cold ones.
    let newest: Vec<u64> = actual
        .keys()
        .rev()
        .take(params.skip_pending_newest)
        .copied()
        .collect();
    let mut by_pending: Vec<(u64, u64)> = actual
        .keys()
        .filter(|p| !newest.contains(p))
        .filter_map(|&p| {
            let base = table.base(generation, p)?;
            let pending = pending_rows(table, generation, p);
            let threshold = base
                .rows
                .checked_div(params.threshold_divisor)
                .unwrap_or(0)
                .max(params.threshold_min);
            (pending >= threshold).then_some((pending, p))
        })
        .collect();
    by_pending.sort_by_key(|a| core::cmp::Reverse(a.0));
    for (_, p) in by_pending {
        push(p, Reason::Pending);
    }
    // Safety net: ClickHouse holds noticeably more rows for the partition than the lake
    // accounts for (raw counts include ~2% upserts the FINAL base deduplicated, hence the
    // slack).
    for (&p, &rows) in actual {
        let Some(base) = table.base(generation, p) else {
            continue;
        };
        let expected = base.rows.saturating_add(pending_rows(table, generation, p));
        if rows > expected.saturating_add(expected / 20).saturating_add(1000) {
            push(p, Reason::Drift);
        }
    }
    let mut by_age: Vec<(i64, u64)> = actual
        .keys()
        .filter_map(|&p| {
            let hi = table.base(generation, p)?.hi?;
            (watermark_hi.saturating_sub(hi) > params.max_base_age_secs).then_some((hi, p))
        })
        .collect();
    by_age.sort_unstable();
    for (_, p) in by_age {
        push(p, Reason::Rolling);
    }
    plan
}

pub(crate) struct Fold {
    pub(crate) lo: i64,
    pub(crate) hi: i64,
    pub(crate) keys: Vec<String>,
}

/// Hourly deltas of `generation` whose `hi` is at or before `before` and can be folded into
/// one residual covering the union of their windows. The residual is exported from `ClickHouse`
/// over `(lo, hi]`, so windows that produced no file (zero rows) are covered too.
pub(crate) fn plan_fold(table: &TableState, generation: u32, before: i64) -> Option<Fold> {
    let mut deltas: Vec<_> = table
        .files_of(generation, FileKind::Delta)
        .filter(|f| f.hi.is_some_and(|hi| hi <= before))
        .collect();
    if deltas.len() < 2 {
        return None;
    }
    deltas.sort_by_key(|f| f.lo);
    Some(Fold {
        lo: deltas.iter().filter_map(|f| f.lo).min()?,
        hi: deltas.iter().filter_map(|f| f.hi).max()?,
        keys: deltas.iter().map(|f| f.key.clone()).collect(),
    })
}

/// Per-partition cutoff for a residual export: rows of partition `p` must be newer than the
/// base of `p` (or than `lo` when there is no base). Partitions whose base already reaches
/// `hi` are excluded entirely by the caller's `watermark <= hi` bound.
pub(crate) fn residual_cutoffs(table: &TableState, generation: u32, lo: i64) -> BTreeMap<u64, i64> {
    table
        .files_of(generation, FileKind::Base)
        .filter_map(|b| Some((b.partition?, b.hi?.max(lo))))
        .collect()
}

/// Delta/residual files every partition of which is covered by a base at least as new.
pub(crate) fn covered_files(table: &TableState, generation: u32) -> Vec<String> {
    table
        .increments(generation)
        .filter(|f| {
            let Some(hi) = f.hi else { return false };
            f.rows_by_partition.keys().all(|&p| {
                table
                    .base(generation, p)
                    .and_then(|b| b.hi)
                    .is_some_and(|base_hi| base_hi >= hi)
            })
        })
        .map(|f| f.key.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;
    use crate::services::data_dump::manifest::{FileEntry, PolicyKind};

    fn params() -> Params {
        Params {
            budget: 2,
            threshold_divisor: 100,
            threshold_min: 20_000,
            skip_pending_newest: 0,
            max_base_age_secs: 30 * 86_400,
        }
    }

    fn file(kind: FileKind, partition: Option<u64>, lo: i64, hi: i64, rows: u64) -> FileEntry {
        FileEntry {
            key: format!("{kind:?}-{partition:?}-{lo}-{hi}"),
            kind,
            generation: 1,
            partition,
            lo: (kind != FileKind::Base).then_some(lo),
            hi: Some(hi),
            rows,
            bytes: rows,
            rows_by_partition: if kind == FileKind::Base {
                BTreeMap::new()
            } else {
                BTreeMap::from([(partition.unwrap_or(0), rows)])
            },
            built_at: Utc::now(),
        }
    }

    fn table(files: Vec<FileEntry>) -> TableState {
        let mut t = TableState::new(PolicyKind::Incremental, vec![]);
        t.generation = 1;
        t.files = files;
        t
    }

    #[test]
    fn chunks_split_inside_their_range_only() {
        let all = Chunk::default();
        assert_eq!(all.split(&[]), vec![all]);
        assert_eq!(
            all.split(&[20, 10, 20]),
            vec![
                Chunk {
                    from: None,
                    to: Some(10)
                },
                Chunk {
                    from: Some(10),
                    to: Some(20)
                },
                Chunk {
                    from: Some(20),
                    to: None
                },
            ]
        );
        let mid = Chunk {
            from: Some(10),
            to: Some(20),
        };
        // Bounds on or outside the edges would produce empty or overlapping chunks.
        assert_eq!(mid.split(&[5, 10, 20, 30]), vec![mid]);
        assert_eq!(
            mid.split(&[15]),
            vec![
                Chunk {
                    from: Some(10),
                    to: Some(15)
                },
                Chunk {
                    from: Some(15),
                    to: Some(20)
                },
            ]
        );
    }

    #[test]
    fn chunk_counts_follow_the_estimate() {
        assert_eq!(chunk_count(0), 1);
        assert_eq!(chunk_count(TARGET_FILE_BYTES), 1);
        assert_eq!(chunk_count(TARGET_FILE_BYTES + 1), 2);
        assert_eq!(chunk_count(5_382_509_236), 14);
        assert_eq!(chunk_count(u64::MAX), 256);

        let mut t = table(vec![file(FileKind::Base, Some(1), 0, 100, 1_000)]);
        t.files[0].bytes = 3_000;
        // Own base first, then the table's, then the default.
        assert_eq!(estimate_base_bytes(&t, 1, 2_000), 6_000);
        assert_eq!(estimate_base_bytes(&t, 2, 10), 30);
        t.files.push(file(FileKind::Base, Some(2), 0, 100, 10));
        assert_eq!(estimate_base_bytes(&t, 2, 20), 20);
        assert_eq!(estimate_base_bytes(&table(vec![]), 1, 10), 20_000);
        // Split bases count together.
        t.files.push(file(FileKind::Base, Some(1), 0, 100, 1_000));
        assert_eq!(
            t.base(1, 1).map(|b| (b.rows, b.bytes)),
            Some((2_000, 4_000))
        );
    }

    #[test]
    fn missing_bases_come_before_pending() {
        let t = table(vec![
            file(FileKind::Base, Some(1), 0, 100, 1_000_000),
            file(FileKind::Delta, Some(1), 100, 200, 50_000),
        ]);
        let actual = BTreeMap::from([(1, 1_050_000), (2, 10), (3, 10)]);
        let plan = plan_rebuilds(&t, 1, &actual, 200, &params());
        assert_eq!(
            plan,
            vec![
                Rebuild {
                    partition: 2,
                    reason: Reason::Missing
                },
                Rebuild {
                    partition: 3,
                    reason: Reason::Missing
                },
            ]
        );
        let plan = plan_rebuilds(
            &t,
            1,
            &actual,
            200,
            &Params {
                budget: 3,
                ..params()
            },
        );
        assert_eq!(
            plan[2],
            Rebuild {
                partition: 1,
                reason: Reason::Pending
            }
        );
    }

    #[test]
    fn newest_partitions_skip_pending_but_not_drift() {
        let t = table(vec![
            file(FileKind::Base, Some(1), 0, 100, 1_000),
            file(FileKind::Delta, Some(1), 100, 200, 50_000),
            file(FileKind::Base, Some(2), 0, 100, 1_000),
            file(FileKind::Delta, Some(2), 100, 200, 50_000),
        ]);
        let actual = BTreeMap::from([(1, 51_000), (2, 51_000)]);
        let params = Params {
            skip_pending_newest: 1,
            ..params()
        };
        assert_eq!(
            plan_rebuilds(&t, 1, &actual, 200, &params),
            vec![Rebuild {
                partition: 1,
                reason: Reason::Pending
            }]
        );

        let drifted = BTreeMap::from([(1, 51_000), (2, 100_000)]);
        assert_eq!(
            plan_rebuilds(&t, 1, &drifted, 200, &params)[1],
            Rebuild {
                partition: 2,
                reason: Reason::Drift
            }
        );
    }

    #[test]
    fn pending_ignores_rows_already_covered_by_a_newer_base() {
        let t = table(vec![
            file(FileKind::Base, Some(1), 0, 300, 100),
            file(FileKind::Delta, Some(1), 100, 200, 50),
            file(FileKind::Delta, Some(1), 300, 400, 7),
        ]);
        assert_eq!(pending_rows(&t, 1, 1), 7);
        assert_eq!(covered_files(&t, 1), vec!["Delta-Some(1)-100-200"]);
    }

    #[test]
    fn small_backlog_does_not_trigger_but_drift_and_age_do() {
        let t = table(vec![
            file(FileKind::Base, Some(1), 0, 100, 1_000_000),
            file(FileKind::Delta, Some(1), 100, 200, 100),
            file(FileKind::Base, Some(2), 0, 100, 1_000),
        ]);
        let actual = BTreeMap::from([(1, 1_000_100), (2, 1_000)]);
        assert_eq!(
            plan_rebuilds(&t, 1, &actual, 200, &params()),
            Vec::<Rebuild>::new()
        );

        let drifted = BTreeMap::from([(1, 1_200_000), (2, 1_000)]);
        let plan = plan_rebuilds(&t, 1, &drifted, 200, &params());
        assert_eq!(
            plan,
            vec![Rebuild {
                partition: 1,
                reason: Reason::Drift
            }]
        );

        let old = 100 + 31 * 86_400;
        let plan = plan_rebuilds(&t, 1, &actual, old, &params());
        assert_eq!(plan.len(), 2);
        assert!(plan.iter().all(|r| r.reason == Reason::Rolling));
    }

    #[test]
    fn fold_unions_windows_and_cutoffs_follow_bases() {
        let t = table(vec![
            file(FileKind::Base, Some(1), 0, 150, 10),
            file(FileKind::Delta, Some(1), 100, 200, 1),
            file(FileKind::Delta, Some(2), 200, 300, 1),
            file(FileKind::Delta, Some(2), 300, 400, 1),
        ]);
        let fold = plan_fold(&t, 1, 300).unwrap();
        assert_eq!((fold.lo, fold.hi), (100, 300));
        assert_eq!(fold.keys.len(), 2);
        assert!(plan_fold(&t, 1, 200).is_none());
        assert_eq!(residual_cutoffs(&t, 1, 100), BTreeMap::from([(1, 150)]));
    }

    /// Random histories: rows land at random watermarks in random partitions; ticks export
    /// deltas, rebuild bases, fold and drop. The union of published files must contain every
    /// row exactly once per (partition, watermark) once duplicates from bases are resolved.
    #[test]
    fn coverage_invariant_holds_under_random_histories() {
        use std::collections::HashSet;
        let mut seed: u64 = 0x9E37_79B9_7F4A_7C15;
        let mut rng = move || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        for _ in 0..40 {
            let mut t = table(vec![]);
            // (partition, watermark) of every row inserted so far.
            let mut rows: Vec<(u64, i64)> = Vec::new();
            let mut watermark = 0i64;
            let partitions: Vec<u64> = (0..5).collect();
            for tick in 1..=30i64 {
                let lo = watermark;
                let hi = tick * 3600;
                // Insert rows into this window.
                let n = (rng() % 6) as usize;
                let mut by_p: BTreeMap<u64, u64> = BTreeMap::new();
                for _ in 0..n {
                    let p = partitions[(rng() % 5) as usize];
                    let wm = lo + 1 + i64::try_from(rng() % 3600).unwrap_or(0).rem_euclid(hi - lo);
                    rows.push((p, wm));
                    *by_p.entry(p).or_default() += 1;
                }
                if !by_p.is_empty() {
                    let mut f = file(FileKind::Delta, None, lo, hi, u64::try_from(n).unwrap());
                    f.rows_by_partition = by_p;
                    t.files.push(f);
                }
                watermark = hi;
                // Rebuild a random partition with cutoff = watermark.
                if rng() % 2 == 0 {
                    let p = partitions[(rng() % 5) as usize];
                    t.files
                        .retain(|f| !(f.kind == FileKind::Base && f.partition == Some(p)));
                    let count = rows
                        .iter()
                        .filter(|(rp, wm)| *rp == p && *wm <= watermark)
                        .count();
                    t.files.push(file(
                        FileKind::Base,
                        Some(p),
                        0,
                        watermark,
                        u64::try_from(count).unwrap(),
                    ));
                }
                // Fold deltas older than 4 ticks into a residual.
                if let Some(fold) = plan_fold(&t, 1, watermark - 4 * 3600) {
                    let cutoffs = residual_cutoffs(&t, 1, fold.lo);
                    let mut by_p: BTreeMap<u64, u64> = BTreeMap::new();
                    for (p, wm) in &rows {
                        let cutoff = cutoffs.get(p).copied().unwrap_or(fold.lo);
                        if *wm > cutoff && *wm > fold.lo && *wm <= fold.hi {
                            *by_p.entry(*p).or_default() += 1;
                        }
                    }
                    t.files.retain(|f| !fold.keys.contains(&f.key));
                    if !by_p.is_empty() {
                        let mut f = file(FileKind::Residual, None, fold.lo, fold.hi, 0);
                        f.rows_by_partition = by_p;
                        t.files.push(f);
                    }
                }
                for key in covered_files(&t, 1) {
                    t.files.retain(|f| f.key != key);
                }
                // Check: every row is visible exactly once through base-or-increment logic.
                for (p, wm) in &rows {
                    let base_hi = t.base(1, *p).and_then(|b| b.hi);
                    if base_hi.is_some_and(|h| *wm <= h) {
                        continue;
                    }
                    let holders: Vec<_> = t
                        .increments(1)
                        .filter(|f| {
                            let (Some(lo), Some(hi)) = (f.lo, f.hi) else {
                                return false;
                            };
                            let in_window = *wm > lo && *wm <= hi;
                            let residual_ok =
                                f.kind != FileKind::Residual || *wm > base_hi.unwrap_or(lo).max(lo);
                            in_window && residual_ok && f.rows_by_partition.contains_key(p)
                        })
                        .collect();
                    assert_eq!(
                        holders.len(),
                        1,
                        "row ({p}, {wm}) at tick {tick} held by {:?}",
                        holders.iter().map(|f| &f.key).collect::<Vec<_>>()
                    );
                }
                let keys: HashSet<_> = t.files.iter().map(|f| &f.key).collect();
                assert_eq!(keys.len(), t.files.len());
            }
        }
    }
}
