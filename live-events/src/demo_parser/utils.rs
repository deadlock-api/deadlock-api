use haste::entities::{Entity, ehandle_to_index, is_ehandle_valid};
use haste::parser::Context;

#[allow(
    clippy::wildcard_imports,
    reason = "`expect` on a `use` item is not fulfilled"
)]
use crate::demo_parser::hashes::*;

fn get_entity_coord(ctx: &Context, entity: &Entity, cell_key: u64, vec_key: u64) -> Option<f32> {
    // NOTE: goes through the context because the world size (max coord) is announced by the
    // server; it changed from 16384 to 32768 in build 6712.
    ctx.deadlock_coord_from_cell(entity.get_value(&cell_key)?, entity.get_value(&vec_key)?)
        .into()
}

pub(super) fn get_entity_position(ctx: &Context, entity: &Entity) -> Option<[f32; 3]> {
    [
        get_entity_coord(ctx, entity, CX, VX)?,
        get_entity_coord(ctx, entity, CY, VY)?,
        get_entity_coord(ctx, entity, CZ, VZ)?,
    ]
    .into()
}

/// Converts a networked entity handle to an entity index, mapping the invalid handle (e.g. a
/// dead hero's pawn has no controller, the demo recorder's controller has no pawn) to `None`.
pub(super) fn handle_to_entity_index(handle: Option<u32>) -> Option<i32> {
    handle
        .filter(|h| is_ehandle_valid(*h))
        .map(ehandle_to_index)
}

/// Reads an entity handle field and converts it with [`handle_to_entity_index`].
pub(super) fn get_entity_handle_index(entity: &Entity, key: u64) -> Option<i32> {
    handle_to_entity_index(entity.get_value(&key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_to_entity_index() {
        // real handles from a build 6712 replay: controller -> pawn 94, and the invalid handle
        assert_eq!(handle_to_entity_index(Some(11_419_742)), Some(94));
        assert_eq!(handle_to_entity_index(Some(16_777_215)), None);
        assert_eq!(handle_to_entity_index(None), None);
    }
}
