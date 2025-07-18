use haste::entities::{Entity, deadlock_coord_from_cell, fkey_from_path};

fn get_entity_coord(entity: &Entity, cell_key: u64, vec_key: u64) -> Option<f32> {
    let cell: u16 = entity.get_value(&cell_key)?;
    let vec: f32 = entity.get_value(&vec_key)?;
    let coord = deadlock_coord_from_cell(cell, vec);
    Some(coord)
}

pub(super) fn get_entity_position(entity: &Entity) -> Option<[f32; 3]> {
    const CX: u64 = fkey_from_path(&["CBodyComponent", "m_cellX"]);
    const CY: u64 = fkey_from_path(&["CBodyComponent", "m_cellY"]);
    const CZ: u64 = fkey_from_path(&["CBodyComponent", "m_cellZ"]);

    const VX: u64 = fkey_from_path(&["CBodyComponent", "m_vecX"]);
    const VY: u64 = fkey_from_path(&["CBodyComponent", "m_vecY"]);
    const VZ: u64 = fkey_from_path(&["CBodyComponent", "m_vecZ"]);

    let x = get_entity_coord(entity, CX, VX)?;
    let y = get_entity_coord(entity, CY, VY)?;
    let z = get_entity_coord(entity, CZ, VZ)?;

    Some([x, y, z])
}
