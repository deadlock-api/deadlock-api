use haste::entities::{Entity, deadlock_coord_from_cell};

#[allow(clippy::wildcard_imports)]
use crate::demo_parser::hashes::*;

fn get_entity_coord(entity: &Entity, cell_key: u64, vec_key: u64) -> Option<f32> {
    deadlock_coord_from_cell(entity.get_value(&cell_key)?, entity.get_value(&vec_key)?).into()
}

pub(super) fn get_entity_position(entity: &Entity) -> Option<[f32; 3]> {
    [
        get_entity_coord(entity, CX, VX)?,
        get_entity_coord(entity, CY, VY)?,
        get_entity_coord(entity, CZ, VZ)?,
    ]
    .into()
}
