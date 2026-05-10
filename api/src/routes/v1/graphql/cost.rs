//! Default cost guards applied to the GraphQL schema.

/// `GraphiQL`'s introspection query reaches 13 levels deep (4 outer + 9 nested
/// `ofType`). 15 leaves headroom while still rejecting pathological user
/// queries — the deepest legitimate user path is `matches → players → field`.
pub(super) const DEPTH_LIMIT: usize = 15;
pub(super) const COMPLEXITY_LIMIT: usize = 1_000;
/// Hard cap on `limit` regardless of input — mirrors the REST `bulk_metadata` cap.
pub(super) const MAX_LIMIT: u32 = 10_000;
