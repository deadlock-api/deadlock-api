//! Versioned game assets sourced from R2.
//!
//! Each game patch publishes its raw source files (KV3 `.vdata`, panorama
//! `.css`, merged localization `.json`) under `assets-api-res/versions/<v>/…`
//! in the R2 bucket. This module fetches, parses, and transforms them into
//! the public `/v2/...` JSON shapes.

pub(crate) mod accolades;
pub(crate) mod build_tags;
pub(crate) mod colors;
pub(crate) mod common;
pub(crate) mod css;
pub(crate) mod error;
pub(crate) mod generic_data;
pub(crate) mod heroes;
pub(crate) mod localization;
pub(crate) mod loot_tables;
pub(crate) mod misc_entities;
pub(crate) mod npc_units;
pub(crate) mod ranks;
pub(crate) mod steam_info;
pub(crate) mod store;
