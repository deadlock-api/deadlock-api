//! Pure planning over the manifest: which partitions to rebuild, which hourly deltas to fold,
//! which files are fully covered by bases and can go.
//!
//! Invariant every step preserves, per generation: a row with `watermark = t` in partition
//! `p` is in `base(p)` if `t <= base(p).hi`, otherwise in exactly one live delta or residual
//! whose `(lo, hi]` contains `t`. Only watermarks are compared, never wall-clock time.

use std::collections::{BTreeMap, BTreeSet};

use super::manifest::{FileKind, TableState};

pub(crate) struct Params {
    /// Partitions rebuilt per tick.
    pub(crate) budget: usize,
    /// Rebuild once pending rows exceed `max(base.rows / threshold_divisor, threshold_min)`.
    pub(crate) threshold_divisor: u64,
    pub(crate) threshold_min: u64,
    /// Rolling refresh: rebuild bases older than this (seconds of watermark time).
    pub(crate) max_base_age_secs: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Reason {
    Forced,
    Missing,
    /// The base predates the table's current column set (see `TableState::schema_version`).
    Schema,
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
/// `forced` are partitions queued by privacy deletion requests; `watermark_hi` is the
/// table's current watermark.
pub(crate) fn plan_rebuilds(
    table: &TableState,
    generation: u32,
    actual: &BTreeMap<u64, u64>,
    forced: &BTreeSet<u64>,
    watermark_hi: i64,
    params: &Params,
) -> Vec<Rebuild> {
    let mut plan: Vec<Rebuild> = Vec::new();
    let mut push = |partition: u64, reason: Reason| {
        if plan.len() < params.budget && !plan.iter().any(|r| r.partition == partition) {
            plan.push(Rebuild { partition, reason });
        }
    };

    for &p in forced {
        if actual.contains_key(&p) {
            push(p, Reason::Forced);
        }
    }
    for &p in actual.keys() {
        if table.base(generation, p).is_none() {
            push(p, Reason::Missing);
        }
    }
    // Bases exported before the last column change lack the new columns; oldest first.
    let mut by_schema: Vec<(Option<i64>, u64)> = actual
        .keys()
        .filter_map(|&p| {
            let base = table.base(generation, p)?;
            (base.schema_version < table.schema_version).then_some((base.hi, p))
        })
        .collect();
    by_schema.sort_unstable();
    for (_, p) in by_schema {
        push(p, Reason::Schema);
    }
    // Largest backlog first so hot partitions never starve behind cold ones.
    let mut by_pending: Vec<(u64, u64, u64)> = actual
        .iter()
        .filter_map(|(&p, &rows)| {
            let base = table.base(generation, p)?;
            let pending = pending_rows(table, generation, p);
            let threshold = (base.rows / params.threshold_divisor).max(params.threshold_min);
            (pending >= threshold).then_some((pending, p, rows))
        })
        .collect();
    by_pending.sort_by_key(|a| core::cmp::Reverse(a.0));
    for (_, p, _) in by_pending {
        push(p, Reason::Pending);
    }
    // Safety net: ClickHouse holds noticeably more rows for the partition than the lake
    // accounts for (raw counts include ~2% upserts the FINAL base deduplicated, hence the
    // slack).
    for (&p, &rows) in actual {
        let Some(base) = table.base(generation, p) else {
            continue;
        };
        let expected = base.rows + pending_rows(table, generation, p);
        if rows > expected + expected / 20 + 1000 {
            push(p, Reason::Drift);
        }
    }
    let mut by_age: Vec<(i64, u64)> = actual
        .keys()
        .filter_map(|&p| {
            let hi = table.base(generation, p)?.hi?;
            (watermark_hi - hi > params.max_base_age_secs).then_some((hi, p))
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
            schema_version: 1,
            built_at: Utc::now(),
        }
    }

    fn table(files: Vec<FileEntry>) -> TableState {
        let mut t = TableState::new(PolicyKind::Incremental, vec![]);
        t.generation = 1;
        t.schema_version = 1;
        t.files = files;
        t
    }

    #[test]
    fn bases_behind_the_schema_version_are_rebuilt_after_missing_ones() {
        let mut t = table(vec![
            file(FileKind::Base, Some(1), 0, 300, 10),
            file(FileKind::Base, Some(2), 0, 100, 10),
            file(FileKind::Base, Some(3), 0, 200, 10),
        ]);
        let actual = BTreeMap::from([(1, 10), (2, 10), (3, 10), (4, 10)]);
        let plan = plan_rebuilds(&t, 1, &actual, &BTreeSet::new(), 300, &params());
        assert_eq!(
            plan,
            vec![Rebuild {
                partition: 4,
                reason: Reason::Missing
            }]
        );

        // The view gained a column: every base is behind, oldest first, after the missing one.
        t.schema_version = 2;
        let plan = plan_rebuilds(
            &t,
            1,
            &actual,
            &BTreeSet::new(),
            300,
            &Params {
                budget: 10,
                ..params()
            },
        );
        assert_eq!(
            plan,
            vec![
                Rebuild {
                    partition: 4,
                    reason: Reason::Missing
                },
                Rebuild {
                    partition: 2,
                    reason: Reason::Schema
                },
                Rebuild {
                    partition: 3,
                    reason: Reason::Schema
                },
                Rebuild {
                    partition: 1,
                    reason: Reason::Schema
                },
            ]
        );
        // Rebuilt bases carry the new version and drop out of the plan.
        for f in &mut t.files {
            if f.partition == Some(2) {
                f.schema_version = 2;
            }
        }
        let plan = plan_rebuilds(&t, 1, &actual, &BTreeSet::new(), 300, &params());
        assert_eq!(
            plan.iter().map(|r| r.partition).collect::<Vec<_>>(),
            vec![4, 3]
        );
    }

    #[test]
    fn missing_bases_come_before_pending_and_forced_first() {
        let t = table(vec![
            file(FileKind::Base, Some(1), 0, 100, 1_000_000),
            file(FileKind::Delta, Some(1), 100, 200, 50_000),
        ]);
        let actual = BTreeMap::from([(1, 1_050_000), (2, 10), (3, 10)]);
        let plan = plan_rebuilds(&t, 1, &actual, &BTreeSet::from([3]), 200, &params());
        assert_eq!(
            plan,
            vec![
                Rebuild {
                    partition: 3,
                    reason: Reason::Forced
                },
                Rebuild {
                    partition: 2,
                    reason: Reason::Missing
                },
            ]
        );
        let plan = plan_rebuilds(
            &t,
            1,
            &actual,
            &BTreeSet::new(),
            200,
            &Params {
                budget: 3,
                ..params()
            },
        );
        assert_eq!(
            plan[1],
            Rebuild {
                partition: 3,
                reason: Reason::Missing
            }
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
        assert!(plan_rebuilds(&t, 1, &actual, &BTreeSet::new(), 200, &params()).is_empty());

        let drifted = BTreeMap::from([(1, 1_200_000), (2, 1_000)]);
        let plan = plan_rebuilds(&t, 1, &drifted, &BTreeSet::new(), 200, &params());
        assert_eq!(
            plan,
            vec![Rebuild {
                partition: 1,
                reason: Reason::Drift
            }]
        );

        let old = 100 + 31 * 86_400;
        let plan = plan_rebuilds(&t, 1, &actual, &BTreeSet::new(), old, &params());
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
