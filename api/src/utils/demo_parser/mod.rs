use cached::proc_macro::once;
use strum::VariantArray;

use crate::utils::demo_parser::entity_events::EntityType;

pub(crate) mod entity_events;
pub(crate) mod error;
mod hashes;
pub(crate) mod types;
mod utils;
pub(crate) mod visitor;

#[once]
fn all_sse_events() -> Vec<String> {
    EntityType::VARIANTS
        .iter()
        .flat_map(|e| {
            [
                format!("{e}_entity_created"),
                format!("{e}_entity_updated"),
                format!("{e}_entity_deleted"),
            ]
        })
        .chain(["tick_end", "end"].into_iter().map(ToString::to_string))
        .collect()
}
