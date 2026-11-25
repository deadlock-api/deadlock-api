/// How a published table is exported.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Policy {
    /// Hourly delta files keyed on `watermark` plus one base file per partition, rebuilt with
    /// `FINAL` when enough new rows accumulate (see `compaction`).
    Incremental {
        watermark: &'static str,
        partition_expr: &'static str,
        /// Leading sort-key column a partition's base is split on into files small enough
        /// for the edge cache (`compaction::MAX_FILE_BYTES`). Every version of a row shares
        /// it, so `FINAL` deduplicates within one file.
        chunk_column: &'static str,
    },
    /// One full file, exported with `FINAL` on the first tick at least `every_hours` after the
    /// previous one. The big, slow-changing tables refresh less often: `steam_profiles` cost
    /// ~200 CPU-s per hourly export (2026-11-25) to republish 2.6 GB that barely changed.
    Snapshot { every_hours: i64 },
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct TablePolicy {
    /// Name of both the base table and its `dump.<name>` view.
    pub(crate) name: &'static str,
    pub(crate) policy: Policy,
}

/// Every table published on the public data lake. Mostly root tables (the ones the ingest tools
/// write to); materialized-view targets stay private unless they are small and useful on their
/// own, like `player_cluster_matches` (derivable from `match_player` and `match_salts` anyway).
pub(crate) const TABLES: &[TablePolicy] = &[
    TablePolicy {
        name: "match_player",
        policy: Policy::Incremental {
            watermark: "created_at",
            partition_expr: "intDiv(match_id, 1000000)",
            chunk_column: "match_id",
        },
    },
    TablePolicy {
        name: "match_salts",
        policy: Policy::Snapshot { every_hours: 1 },
    },
    TablePolicy {
        name: "leaderboard",
        policy: Policy::Snapshot { every_hours: 1 },
    },
    TablePolicy {
        name: "hero_leaderboard",
        policy: Policy::Snapshot { every_hours: 1 },
    },
    TablePolicy {
        name: "steam_profiles",
        policy: Policy::Snapshot { every_hours: 6 },
    },
    TablePolicy {
        name: "steam_profile_observed_names",
        policy: Policy::Snapshot { every_hours: 6 },
    },
    TablePolicy {
        name: "server_clusters",
        policy: Policy::Snapshot { every_hours: 1 },
    },
    TablePolicy {
        name: "player_cluster_matches",
        policy: Policy::Snapshot { every_hours: 6 },
    },
];
