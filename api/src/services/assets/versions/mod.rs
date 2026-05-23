//! Versioned game assets sourced from R2.
//!
//! Each game patch publishes its raw source files (KV3 `.vdata`, panorama
//! `.css`, merged localization `.json`) under `assets-api-res/versions/<v>/…`
//! in the R2 bucket. This module is the rust-side equivalent of the legacy
//! python `deadlock-assets-api`: it fetches those files, parses them, and
//! transforms them into the public `/v2/...` JSON shapes.
//!
//! Endpoints layered on top should only depend on the typed builders in this
//! module — never reach for the raw `r2_client` directly.

pub(crate) mod css;
pub(crate) mod heroes;
pub(crate) mod store;
