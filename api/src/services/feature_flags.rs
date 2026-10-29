//! Runtime feature flags, managed in the Postgres `feature_flags` table.
//!
//! Every flag registers itself: on startup the API upserts every flag declared in [`flags!`] and
//! every route in the `OpenAPI` spec, and a route or flag missing from the table (an undocumented
//! route) is registered on its first lookup. New rows take the code's default; after that the
//! table owns `enabled`, and each replica re-reads it every [`REFRESH_INTERVAL`]. When Postgres is
//! unreachable the last snapshot stays in effect, and flags never loaded fall back to their
//! defaults.

use core::time::Duration;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, PoisonError};

use arc_swap::ArcSwap;
use sqlx::{Pool, Postgres};
use strum::IntoStaticStr;
use tokio::time::MissedTickBehavior;
use tracing::{debug, info, warn};
use utoipa::openapi::OpenApi;

const REFRESH_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq, IntoStaticStr)]
#[strum(serialize_all = "snake_case")]
pub(crate) enum Kind {
    /// An API route, keyed by its axum path. Disabled routes answer 503.
    Route,
    /// A behavior inside request handling.
    Feature,
    /// A background job, checked on every tick.
    Job,
}

impl Kind {
    fn as_str(self) -> &'static str {
        self.into()
    }
}

/// A flag declared in code. Route flags have no declaration: every route is one.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Flag {
    pub(crate) key: &'static str,
    pub(crate) kind: Kind,
    pub(crate) default: bool,
    pub(crate) description: &'static str,
}

/// Declares the non-route flags. Each one is registered on startup.
macro_rules! flags {
    ($($name:ident: $kind:ident $key:literal = $default:literal, $description:literal;)*) => {
        $(
            #[doc = $description]
            pub(crate) const $name: Flag = Flag {
                key: $key,
                kind: Kind::$kind,
                default: $default,
                description: $description,
            };
        )*
        const DECLARED: &[Flag] = &[$($name),*];
    };
}

flags! {
    EMERGENCY_MODE: Feature "emergency_mode" = false,
        "Turns clients without an API key away from every rate-limited endpoint with a 503.";
    STEAM_SALTS_FALLBACK: Feature "steam_salts_fallback" = true,
        "Fetches match salts missing from `ClickHouse` from Steam. Disabled, the salts and metadata \
         endpoints behave as if every request set `disable_steam=true`.";
    REQUEST_LOGGING: Feature "request_logging" = true,
        "Logs every request to the `ClickHouse` `request_logs` table.";
    COHORT_AGG_REFRESH: Job "cohort_agg_refresh" = true,
        "Refreshes the item, cohort, enemy and perf-curve rollups every 30 minutes.";
    PATREON_VERIFICATION: Job "patreon_verification" = true,
        "Refreshes Patreon tokens and memberships hourly and retries failed verifications.";
    STEAM_SEARCH_INDEX_REFRESH: Job "steam_search_index_refresh" = true,
        "Rebuilds the Steam profile search index from `ClickHouse`.";
    DATA_DUMP: Job "data_dump" = true,
        "Exports the public data dump (needs `DATA_DUMP_ENABLED` as well).";
}

/// The table's view of a flag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FlagState {
    pub(crate) enabled: bool,
    pub(crate) disabled_reason: Option<String>,
}

impl FlagState {
    const fn default_for(enabled: bool) -> Self {
        Self {
            enabled,
            disabled_reason: None,
        }
    }
}

/// A row to upsert.
struct Registration {
    key: String,
    kind: Kind,
    default: bool,
    /// `None` keeps the stored description.
    description: Option<String>,
}

impl From<&Flag> for Registration {
    fn from(flag: &Flag) -> Self {
        Self {
            key: flag.key.to_owned(),
            kind: flag.kind,
            default: flag.default,
            description: Some(flag.description.to_owned()),
        }
    }
}

/// Cheap to clone handle on the flag snapshot.
#[derive(Clone)]
pub(crate) struct FeatureFlags(Arc<Inner>);

struct Inner {
    pg: Pool<Postgres>,
    snapshot: ArcSwap<HashMap<String, FlagState>>,
    /// Keys that missed the snapshot and were already queued for registration.
    queued: Mutex<HashSet<String>>,
    /// Debug builds only read the table, so a local run does not register its branch's routes.
    writes: bool,
}

impl FeatureFlags {
    /// Creates the table if needed, registers the declared flags, loads the snapshot and keeps it
    /// fresh in the background. Postgres errors are logged, not fatal: the defaults apply.
    pub(crate) async fn load(pg: Pool<Postgres>) -> Self {
        let flags = Self(Arc::new(Inner {
            pg,
            snapshot: ArcSwap::default(),
            queued: Mutex::default(),
            writes: !cfg!(debug_assertions),
        }));
        if flags.0.writes {
            flags
                .register(DECLARED.iter().map(Registration::from))
                .await;
        }
        flags.refresh().await;
        flags.spawn_refresh_loop();
        flags
    }

    /// Registers every route of the `OpenAPI` spec, described by its summary, and reloads the
    /// snapshot.
    pub(crate) async fn register_routes(&self, api: &OpenApi) {
        if !self.0.writes {
            return;
        }
        let routes = api.paths.paths.iter().map(|(path, item)| Registration {
            key: path.clone(),
            kind: Kind::Route,
            default: true,
            description: [&item.get, &item.post, &item.put, &item.patch, &item.delete]
                .into_iter()
                .flatten()
                .find_map(|op| op.summary.clone()),
        });
        self.register(routes).await;
        self.refresh().await;
    }

    /// Whether `flag` is enabled.
    pub(crate) fn is_enabled(&self, flag: &Flag) -> bool {
        self.lookup(flag.key, || Registration::from(flag))
            .map_or(flag.default, |state| state.enabled)
    }

    /// The state of the route with the axum path `path`. Routes are enabled by default.
    pub(crate) fn route(&self, path: &str) -> FlagState {
        self.lookup(path, || Registration {
            key: path.to_owned(),
            kind: Kind::Route,
            default: true,
            description: None,
        })
        .unwrap_or(FlagState::default_for(true))
    }

    /// The stored state of `key`, registering it in the background when the table has no row.
    fn lookup(&self, key: &str, registration: impl FnOnce() -> Registration) -> Option<FlagState> {
        if let Some(state) = self.0.snapshot.load().get(key) {
            return Some(state.clone());
        }
        self.queue_registration(registration());
        None
    }

    fn queue_registration(&self, registration: Registration) {
        if !self.0.writes {
            return;
        }
        let newly_queued = self
            .0
            .queued
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(registration.key.clone());
        if newly_queued {
            let flags = self.clone();
            tokio::spawn(async move {
                info!("Registering feature flag {}", registration.key);
                flags.register([registration]).await;
            });
        }
    }

    /// Inserts missing flags with their default and marks existing ones as seen. Never touches
    /// `enabled` or `disabled_reason` of an existing row.
    async fn register(&self, registrations: impl IntoIterator<Item = Registration>) {
        let mut registrations: Vec<_> = registrations.into_iter().collect();
        // A fixed row order keeps concurrent upserts of starting replicas from deadlocking.
        registrations.sort_unstable_by(|a, b| a.key.cmp(&b.key));
        registrations.dedup_by(|a, b| a.key == b.key);
        let count = registrations.len();
        let mut keys = Vec::with_capacity(count);
        let mut kinds = Vec::with_capacity(count);
        let mut defaults = Vec::with_capacity(count);
        let mut descriptions = Vec::with_capacity(count);
        for r in registrations {
            keys.push(r.key);
            kinds.push(r.kind.as_str());
            defaults.push(r.default);
            descriptions.push(r.description);
        }
        let result = sqlx::query(
            "
            INSERT INTO feature_flags (key, kind, enabled, description)
            SELECT * FROM UNNEST($1::TEXT[], $2::TEXT[], $3::BOOLEAN[], $4::TEXT[])
            ON CONFLICT (key) DO UPDATE
            SET kind         = EXCLUDED.kind,
                description  = COALESCE(EXCLUDED.description, feature_flags.description),
                last_seen_at = now()
            ",
        )
        .bind(&keys)
        .bind(&kinds)
        .bind(&defaults)
        .bind(&descriptions)
        .execute(&self.0.pg)
        .await;
        match result {
            Ok(_) => debug!("Registered {count} feature flags"),
            Err(e) => warn!("Failed to register {count} feature flags: {e}"),
        }
    }

    /// Replaces the snapshot with the table, logging every flag that changed.
    async fn refresh(&self) {
        let rows: Vec<(String, bool, Option<String>)> =
            match sqlx::query_as("SELECT key, enabled, disabled_reason FROM feature_flags")
                .fetch_all(&self.0.pg)
                .await
            {
                Ok(rows) => rows,
                Err(e) => {
                    warn!("Failed to load feature flags, keeping the previous ones: {e}");
                    return;
                }
            };
        let snapshot: HashMap<_, _> = rows
            .into_iter()
            .map(|(key, enabled, disabled_reason)| {
                let state = FlagState {
                    enabled,
                    disabled_reason,
                };
                (key, state)
            })
            .collect();
        let previous = self.0.snapshot.load();
        for (key, state) in &snapshot {
            let changed = previous
                .get(key)
                .map_or(!state.enabled, |old| old.enabled != state.enabled);
            if changed {
                let reason = state.disabled_reason.as_deref().unwrap_or("-");
                if state.enabled {
                    info!("Feature flag {key} is enabled");
                } else {
                    info!("Feature flag {key} is disabled (reason: {reason})");
                }
            }
        }
        self.0.snapshot.store(Arc::new(snapshot));
        // Registered keys no longer miss; failed registrations get another try.
        self.0
            .queued
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clear();
    }

    fn spawn_refresh_loop(&self) {
        let flags = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(REFRESH_INTERVAL);
            tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
            // The first tick fires immediately; `load` just refreshed.
            tick.tick().await;
            loop {
                tokio::select! {
                    _ = tick.tick() => flags.refresh().await,
                    () = crate::SHUTDOWN_TOKEN.cancelled() => break,
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn declared_keys_are_unique_snake_case() {
        let mut keys = HashSet::new();
        for flag in DECLARED {
            assert!(keys.insert(flag.key), "duplicate flag {}", flag.key);
            assert!(
                flag.key
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'),
                "{} is not snake_case",
                flag.key
            );
        }
    }
}
