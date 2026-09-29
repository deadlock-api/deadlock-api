use haste::entities::Entity;
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
