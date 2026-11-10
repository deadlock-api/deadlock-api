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
    /// One full file per hourly tick, exported with `FINAL`.
    Snapshot,
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
        policy: Policy::Snapshot,
    },
    TablePolicy {
        name: "leaderboard",
        policy: Policy::Snapshot,
    },
    TablePolicy {
        name: "hero_leaderboard",
        policy: Policy::Snapshot,
    },
    TablePolicy {
        name: "steam_profiles",
        policy: Policy::Snapshot,
    },
    TablePolicy {
        name: "steam_profile_observed_names",
        policy: Policy::Snapshot,
    },
    TablePolicy {
        name: "server_clusters",
        policy: Policy::Snapshot,
    },
    TablePolicy {
        name: "player_cluster_matches",
        policy: Policy::Snapshot,
    },
];
