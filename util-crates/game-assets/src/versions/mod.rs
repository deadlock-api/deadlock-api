//! Versioned game assets sourced from R2.
//!
//! Each game patch publishes its raw source files (KV3 `.vdata`, panorama
//! `.css`, merged localization `.json`) under `assets-api-res/versions/<v>/…`
//! in the R2 bucket. This module fetches, parses, and transforms them into
//! the public `/v2/...` JSON shapes.

pub mod accolades;
pub mod build_tags;
pub mod colors;
pub mod common;
pub mod convars;
pub(crate) mod css;
pub mod error;
pub mod generic_data;
pub mod heroes;
pub mod items;
pub(crate) mod localization;
pub mod loot_tables;
pub mod map;
pub mod misc_entities;
pub(crate) mod models;
pub mod modifiers;
pub mod npc_units;
pub mod ranked_seasons;
pub mod ranks;
pub mod steam_info;
pub mod store;
