/// How a published table is exported.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Policy {
    /// Hourly delta files keyed on `watermark` plus one base file per partition, rebuilt with
    /// `FINAL` when enough new rows accumulate (see `compaction`).
    Incremental {
        watermark: &'static str,
        partition_expr: &'static str,
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

/// Every table published on the public data lake. Only root tables (the ones the ingest tools
/// write to) are listed; materialized-view targets are derivable and stay private.
pub(crate) const TABLES: &[TablePolicy] = &[
    TablePolicy {
        name: "match_player",
        policy: Policy::Incremental {
            watermark: "created_at",
            partition_expr: "intDiv(match_id, 1000000)",
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
    // `observed_at` is the start time of the match the name was seen in, not the insert time,
    // so it cannot serve as a watermark; the table is small enough for hourly snapshots.
    TablePolicy {
        name: "steam_profile_observed_names",
        policy: Policy::Snapshot,
    },
];
