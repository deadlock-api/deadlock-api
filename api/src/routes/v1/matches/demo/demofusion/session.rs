//! The `DataFusion` session every demo query is planned and run in.
//!
//! User SQL runs inside the API process, so a session must not be able to take the process down:
//! all sessions share one [`RuntimeEnv`] whose memory pool caps operator memory (sorts, joins,
//! aggregates) across every concurrent demo query, and the functions that generate data from a
//! number alone are removed, so a query can only produce work proportional to the demo it reads.

use core::num::NonZeroUsize;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use datafusion::error::DataFusionError;
use datafusion::execution::SessionStateBuilder;
use datafusion::execution::disk_manager::{DiskManagerBuilder, DiskManagerMode};
use datafusion::execution::memory_pool::{GreedyMemoryPool, TrackConsumersPool};
use datafusion::execution::runtime_env::{RuntimeEnv, RuntimeEnvBuilder};
use datafusion::prelude::{SessionConfig, SessionContext};

use super::error::Result;

/// Operator memory shared by all demo queries in the process. The parsed demo tables are
/// `MemTable`s outside the pool, so this bounds only what the query itself allocates on top of
/// them. A query that needs more fails with `Resources exhausted` instead of growing the API's
/// memory until the replica is OOM-killed.
const MEMORY_POOL_BYTES: usize = 8 * 1024 * 1024 * 1024;

/// Array functions that build an array of a caller-chosen length in one allocation, outside the
/// memory pool: `SELECT range(10000000000)` asks for 80 GB in a single row. Their aliases
/// (`list_repeat`, ...) are removed with them.
const ARRAY_GENERATORS: [&str; 4] = ["range", "generate_series", "array_repeat", "array_resize"];

/// Consumers named in a `Resources exhausted` error, so a failed query says what used the memory.
const REPORTED_CONSUMERS: NonZeroUsize = NonZeroUsize::new(3).unwrap();

static RUNTIME: LazyLock<datafusion::error::Result<Arc<RuntimeEnv>>> = LazyLock::new(|| {
    let pool =
        TrackConsumersPool::new(GreedyMemoryPool::new(MEMORY_POOL_BYTES), REPORTED_CONSUMERS);
    // Spilling would only move an oversized query from memory onto the API's disk.
    RuntimeEnvBuilder::new()
        .with_memory_pool(Arc::new(pool))
        .with_disk_manager_builder(
            DiskManagerBuilder::default().with_mode(DiskManagerMode::Disabled),
        )
        .build_arc()
});

/// A session with `DataFusion`'s default functions minus its table functions (`range`,
/// `generate_series`) and [`ARRAY_GENERATORS`], running on the shared demo-query runtime.
///
/// Fails only if the shared runtime could not be built.
pub(crate) fn session_context(config: SessionConfig) -> Result<SessionContext> {
    let runtime = RUNTIME.as_ref().map_err(|e| {
        DataFusionError::Execution(format!("demo query runtime failed to build: {e}"))
    })?;
    let state = SessionStateBuilder::new()
        .with_config(config)
        .with_runtime_env(Arc::clone(runtime))
        .with_default_features()
        .with_table_functions(HashMap::new())
        .build();
    let ctx = SessionContext::new_with_state(state);
    for name in ARRAY_GENERATORS {
        ctx.deregister_udf(name);
    }
    Ok(ctx)
}

#[cfg(test)]
mod tests {
    use datafusion::execution::memory_pool::MemoryLimit;

    use super::*;

    #[tokio::test]
    async fn generators_are_not_plannable() {
        let ctx = session_context(SessionConfig::new()).unwrap();
        for sql in [
            "SELECT count(*) FROM range(100000000000)",
            "SELECT count(*) FROM generate_series(1, 100000000000)",
            "SELECT unnest(range(100000000000))",
            "SELECT generate_series(1, 100000000000)",
            "SELECT array_repeat(1, 10000000000)",
            "SELECT list_repeat(1, 10000000000)",
            "SELECT array_resize([1], 10000000000)",
        ] {
            assert!(ctx.sql(sql).await.is_err(), "{sql}");
        }
        ctx.sql("SELECT make_array(1, 2)").await.unwrap();
    }

    #[test]
    fn sessions_share_one_bounded_pool() {
        let a = session_context(SessionConfig::new()).unwrap().runtime_env();
        let b = session_context(SessionConfig::new()).unwrap().runtime_env();
        assert!(Arc::ptr_eq(&a, &b));
        assert!(matches!(
            a.memory_pool.memory_limit(),
            MemoryLimit::Finite(MEMORY_POOL_BYTES)
        ));
    }
}
