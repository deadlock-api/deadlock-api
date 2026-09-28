use core::fmt::Binary;
use core::hash::BuildHasherDefault;
use std::fmt::{self};
use std::sync::Arc;

use dungers::bitbuf::BitError;
use hashbrown::HashMap;
use hashbrown::hash_map::Entry;
use nohash::NoHashHasher;

use crate::bitreader::BitReader;
use crate::entityclasses::EntityClasses;
use crate::fielddecoder::{DecoderError, FieldDecodeContext};
use crate::fieldpath::{self, FieldPath};
use crate::fieldvalue::{FieldValue, FieldValueConversionError};
use crate::flattenedserializers::{
    FlattenedSerializer, FlattenedSerializerContainer, FlattenedSerializerField,
};
use crate::fxhash;
use crate::instancebaseline::InstanceBaseline;

#[derive(thiserror::Error, Debug)]
pub enum GetValueError {
    #[error("field does not exist")]
    FieldNotExist,
    #[error(transparent)]
    FieldValueConversionError(#[from] FieldValueConversionError),
}

#[derive(thiserror::Error, Debug)]
pub enum EntityParseError {
    #[error(transparent)]
    BitError(#[from] BitError),
    #[error(transparent)]
    Decoder(#[from] DecoderError),
    #[error("field path not found")]
    FieldNotFound,
    #[error(transparent)]
    TryFromInt(#[from] core::num::TryFromIntError),
}

// public/const.h (adjusted)

const MAX_EDICT_BITS: u32 = 14;
const MAX_EDICTS: u32 = 1 << MAX_EDICT_BITS;

const NUM_ENT_ENTRY_BITS: u32 = MAX_EDICT_BITS + 1;
const NUM_SERIAL_NUM_BITS: u32 = 32 - NUM_ENT_ENTRY_BITS;

const NUM_NETWORKED_EHANDLE_SERIAL_NUMBER_BITS: u32 = 10;
const NUM_NETWORKED_EHANDLE_BITS: u32 = MAX_EDICT_BITS + NUM_NETWORKED_EHANDLE_SERIAL_NUMBER_BITS;
const INVALID_NETWORKED_EHANDLE_VALUE: u32 = (1 << NUM_NETWORKED_EHANDLE_BITS) - 1;

#[must_use]
pub fn is_ehandle_valid(handle: u32) -> bool {
    handle != INVALID_NETWORKED_EHANDLE_VALUE
}

// game/client/recvproxy.cpp
// RecvProxy_IntToEHandle
// int iEntity = pData->m_Value.m_Int & ((1 << MAX_EDICT_BITS) - 1);
// int iSerialNum = pData->m_Value.m_Int >> MAX_EDICT_BITS;

#[must_use]
pub fn ehandle_to_index(handle: u32) -> i32 {
    (handle & ((1 << MAX_EDICT_BITS) - 1)) as i32
}

// TODO(blukai): investigate this (from public/basehandle.h):
// > The low NUM_SERIAL_BITS hold the index. If this value is less than MAX_EDICTS, then the entity is networkable.
// > The high NUM_SERIAL_NUM_BITS bits are the serial number.

// NOTE(blukai): can converting index and serial to handle (what CBaseHandle::Init (in
// public/basehandle.h) does) be somehow somewhere useful?:
// m_Index = iEntry | (iSerialNumber << NUM_SERIAL_NUM_SHIFT_BITS);

// NOTE: rust want that coord_from_cell is never used, but that is because there are no default
// features that indicate otherwise (both deadlock and dota2 features are not active by default).
#[allow(dead_code)]
/// given a cell and an offset in that cell, reconstruct the world coord.
///
/// game/shared/cellcoord.h
fn coord_from_cell(cell_width: u32, max_coord: u32, cell: u16, vec: f32) -> f32 {
    let cell_pos = u32::from(cell) * cell_width;
    // nanitfi is r, what does it stand for in this context? (copypasting from valve)

    (cell_pos as i32 - max_coord as i32) as f32 + vec
}

mod deadlock {
    // in replay that i'm fiddling with (3843940_683350910.dem) CBodyComponent.m_vecY of
    // CCitadelPlayerPawn #4 at tick 111,077 is 1022.78125 and CBodyComponent.m_cellY is 36;
    // at tick 111,080 CBodyComponent.m_vecY becomes 0.375 and CBodyComponent.m_cellY 38.
    //
    // thus CELL_BASEENTITY_ORIGIN_CELL_BITS = 10 so that 1 << 10 is 1024 - right?
    // no, it's 9. why? i'm not exactly sure, but i would appreciate of somebody could explain.
    //
    // game/shared/shareddefs.h (adjusted)
    const CELL_BASEENTITY_ORIGIN_CELL_BITS: u32 = 9;
    // game/client/c_baseentity.cpp
    const CELL_WIDTH: u32 = 1 << CELL_BASEENTITY_ORIGIN_CELL_BITS;

    // CNPC_MidBoss (exactly in the middle of the map):
    // CBodyComponent.m_cellX:uint16 = 32
    // CBodyComponent.m_cellY:uint16 = 32
    // CBodyComponent.m_cellZ:uint16 = 30
    // CBodyComponent.m_vecX:CNetworkedQuantizedFloat = 0.0
    // CBodyComponent.m_vecY:CNetworkedQuantizedFloat = 0.0
    // CBodyComponent.m_vecZ:CNetworkedQuantizedFloat = 768.0
    //
    // from this it is safe to conclude that the actual grid is 64x64 which gives us
    // MAX_COORD_INTEGER = CELL_WIDTH * 32. the same exact value that is defined in csgo.
    //
    // also CELL_COUNT can be computed as MAX_COORD_INTEGER * 2 / CELL_WIDTH.
    //
    // public/worldsize.h
    const MAX_COORD_INTEGER: u32 = 16384;

    // CCitadelGameRulesProxy entity contains:
    // m_pGameRules.m_vMinimapMins:Vector = [-8960.0, -8960.005, 0.0]
    // m_pGameRules.m_vMinimapMaxs:Vector = [8960.0, 8960.0, 0.0]

    /// given a cell and an offset in that cell, reconstruct the world coord.
    #[must_use]
    pub fn coord_from_cell(cell: u16, vec: f32) -> f32 {
        super::coord_from_cell(CELL_WIDTH, MAX_COORD_INTEGER, cell, vec)
    }

    // TODO(blukai): impl compact / low precision (u8) variant of coord_from_cell
}

pub use deadlock::coord_from_cell as deadlock_coord_from_cell;

/// generates field key from given path. can and recommended to be called from a const context.
/// when called from a const context, the function is interpreted by the compiler at compile time
/// meaning that there's no const of generating key for given path at runtime.
#[must_use]
pub const fn fkey_from_path(path: &[&str]) -> u64 {
    // NOTE(blukai): this must match what send_node hashing in flattenedserializers.rs. in
    // FlattenedSerializerField::new; and field_key in entities.rs in Entity::parse.
    //
    //   this function needs to be const.
    //   it cannot be generalized into something that would handle all cases where field key needs
    //   to be constructed.
    let seed = fxhash::hash_bytes(path[0].as_bytes());
    let mut hash = seed;

    let mut i = 1;
    while i < path.len() {
        let part_hash = fxhash::hash_bytes(path[i].as_bytes());
        hash = fxhash::add_u64_to_hash(hash, part_hash);
        i += 1;
    }

    hash
}

// csgo srcs:
// - CL_ParseDeltaHeader in engine/client.cpp.
// - DetermineUpdateType in engine/client.cpp
//
// NOTE: this can be decomposed into valve-style update flags and update type, if needed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(transparent)]
pub struct DeltaHeader(u8);

// NOTE: this impl can be usefule for debugging. i do not want to expose tuple's inner value.
impl Binary for DeltaHeader {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> core::fmt::Result {
        fmt::Binary::fmt(&self.0, f)
    }
}

impl DeltaHeader {
    // NOTE: each variant is annotated with branches from CL_ParseDeltaHeader

    // false -> false; no flags
    pub const UPDATE: Self = Self(0b00);

    /// entity came back into pvs, create new entity if one doesn't exist.
    //
    // false -> true; FHDR_ENTERPVS
    pub const CREATE: Self = Self(0b10);

    /// entity left pvs
    //
    // true -> false; FHDR_LEAVEPVS
    pub const LEAVE: Self = Self(0b01);

    /// Entity left pvs and can be deleted
    //
    // true -> true; FHDR_LEAVEPVS and FHDR_DELETE
    pub const DELETE: Self = Self(0b11);

    pub(crate) fn from_bit_reader(br: &mut BitReader) -> Result<Self, BitError> {
        // TODO(blukai): also try merging two bits from read_bool. who's faster?
        let mut buf = [0u8];
        br.read_bits(&mut buf, 2)?;
        Ok(Self(buf[0]))
    }
}

#[derive(Debug, Clone)]
struct EntityField {
    value: FieldValue,
}

// TODO: do not publicly expose Entity's fields
#[derive(Debug, Clone)]
pub struct Entity {
    index: i32,
    fields: HashMap<u64, EntityField, BuildHasherDefault<NoHashHasher<u64>>>,
    serializer: Arc<FlattenedSerializer>,
}

impl Entity {
    fn parse(
        &mut self,
        field_decode_ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
        fps: &mut [FieldPath],
    ) -> Result<(), EntityParseError> {
        // eprintln!("-- {:?}", self.serializer.serializer_name);

        let fp_count = fieldpath::read_field_paths(br, fps)?;
        for fp in &fps[..fp_count] {
            // eprint!("{:?} ", &fp.data[..=fp.last]);

            // Field-path components index `data[0..=last]`, always in bounds (`data: [u8; 7]`,
            // `last < 7`), so they need no `Option` handling; only `get_child` can legitimately
            // miss.
            //
            // NOTE: this loop performes much better then the unrolled
            // version of it, probably because a bunch of ifs cause a bunch
            // of branch misses and branch missles are disasterous.
            let mut field = self
                .serializer
                .get_child(fp.data[0] as usize)
                .ok_or(EntityParseError::FieldNotFound)?;
            // NOTE: field_key construction logic needs to match what `fkey_from_path` does.
            let mut field_key = field.key;
            for i in 1..=fp.last {
                if field.is_dynamic_array() {
                    field = field.get_child(0).ok_or(EntityParseError::FieldNotFound)?;
                    // NOTE: it's sort of weird to hash index, yup. but it simplifies things
                    // when "user" builds a key that has numbers / it makes it so that there's
                    // no need to check whether part of a key needs to be hashed or not - just
                    // hash all parts.
                    field_key = fxhash::add_u64_to_hash(
                        field_key,
                        fxhash::add_u64_to_hash(0, fp.data[i] as u64),
                    );
                } else {
                    // Fixed-size array children are identical clones that all share the array's
                    // `var_name`, so keying them by name collapses every element onto a single
                    // slot. Key by index instead (matching the dynamic-array scheme); the
                    // navigation into the indexed clone is unchanged.
                    let fixed_array = field.is_fixed_array();
                    field = field
                        .get_child(fp.data[i] as usize)
                        .ok_or(EntityParseError::FieldNotFound)?;
                    field_key = if fixed_array {
                        fxhash::add_u64_to_hash(
                            field_key,
                            fxhash::add_u64_to_hash(0, fp.data[i] as u64),
                        )
                    } else {
                        fxhash::add_u64_to_hash(field_key, field.var_name.hash)
                    };
                }
            }

            // eprint!("{:?} {:?} ", field.var_name, field.var_type);

            let field_value = field.metadata.decoder.decode(field_decode_ctx, br)?;

            // eprintln!(" -> {:?}", &field_value);

            match self.fields.entry(field_key) {
                Entry::Occupied(mut oe) => {
                    oe.get_mut().value = field_value;
                }
                Entry::Vacant(ve) => {
                    ve.insert(EntityField { value: field_value });
                }
            }

            // dbg!(&self.field_values);
            // panic!();
        }

        Ok(())
    }

    // public api
    // ----------

    pub fn iter(&self) -> impl Iterator<Item = (&u64, &FieldValue)> {
        self.fields.iter().map(|(key, ef)| (key, &ef.value))
    }

    #[must_use]
    pub fn get_field_value(&self, key: &u64) -> Option<&FieldValue> {
        self.fields.get(key).map(|ef| &ef.value)
    }

    /// get the value of the field with the provided key, and attempt to convert it.
    ///
    /// this is a variant of "getter" returns None on conversion error, intended to be used for
    /// cases where missing and invalid values should be treated the same.
    #[must_use]
    pub fn get_value<T>(&self, key: &u64) -> Option<T>
    where
        FieldValue: TryInto<T, Error = FieldValueConversionError>,
    {
        self.fields
            .get(key)
            .and_then(|entity_field| entity_field.value.clone().try_into().ok())
    }

    /// get the value of the field with the provided key, and attempt to convert it.
    ///
    /// - if the value is missing, it returns [`GetValueError::FieldNotExist`]
    /// - if the value is present but convesion failed, returns
    ///   [`GetValueError::FieldValueConversionError`]
    pub fn try_get_value<T>(&self, key: &u64) -> Result<T, GetValueError>
    where
        FieldValue: TryInto<T, Error = FieldValueConversionError>,
    {
        self.fields.get(key).map_or_else(
            || Err(GetValueError::FieldNotExist),
            |entity_field| {
                entity_field
                    .value
                    .clone()
                    .try_into()
                    .map_err(GetValueError::from)
            },
        )
    }

    #[must_use]
    pub fn serializer(&self) -> &FlattenedSerializer {
        self.serializer.as_ref()
    }

    #[must_use]
    pub fn serializer_name_heq(&self, rhs: u64) -> bool {
        self.serializer.serializer_name.hash == rhs
    }

    #[must_use]
    pub fn get_serializer_field(&self, path: &FieldPath) -> Option<&FlattenedSerializerField> {
        let first = path.get(0).and_then(|i| self.serializer.get_child(i));
        path.iter().skip(1).fold(first, |field, i| {
            field.and_then(|f| f.get_child(*i as usize))
        })
    }

    #[must_use]
    pub fn index(&self) -> i32 {
        self.index
    }
}

fn skip_entity_fields(
    serializer: &FlattenedSerializer,
    _field_decode_ctx: &mut FieldDecodeContext,
    br: &mut BitReader,
    fps: &mut [FieldPath],
) -> Result<(), EntityParseError> {
    let fp_count = fieldpath::read_field_paths(br, fps)?;
    for fp in &fps[..fp_count] {
        // Field-path components index `data[0..=last]`, always in bounds (`data: [u8; 7]`,
        // `last < 7`), so they need no `Option` handling; only `get_child` can legitimately miss.
        let mut field = serializer
            .get_child(fp.data[0] as usize)
            .ok_or(EntityParseError::FieldNotFound)?;

        for i in 1..=fp.last {
            if field.is_dynamic_array() {
                field = field.get_child(0).ok_or(EntityParseError::FieldNotFound)?;
            } else {
                field = field
                    .get_child(fp.data[i] as usize)
                    .ok_or(EntityParseError::FieldNotFound)?;
            }
        }

        field.metadata.decoder.skip_bits(br)?;
    }

    Ok(())
}

#[derive(Debug)]
pub struct EntityContainer {
    // NOTE: hashbrown hashmap with no hash performs better then Vec.
    entities: HashMap<i32, Entity, BuildHasherDefault<NoHashHasher<i32>>>,
    baseline_entities: HashMap<i32, Entity, BuildHasherDefault<NoHashHasher<i32>>>,
    skipped_serializers:
        HashMap<i32, Arc<FlattenedSerializer>, BuildHasherDefault<NoHashHasher<i32>>>,

    // NOTE: it might be tempting to introduce a "wrapper" struct, something like FieldPathReader
    // and turn read_field_path function into a method, but that's just suggar with no practical
    // benefit and extra indirection.
    // atm pointer to field_paths vec is being passed arround - that's 1 level. with theoretical
    // FieldPathsReader there would be 2 levels of indirection (at least as i imagine it right
    // now).
    field_paths: Vec<FieldPath>,
}

impl EntityContainer {
    pub(crate) fn new() -> Self {
        Self {
            entities: HashMap::with_capacity_and_hasher(
                // NOTE(blukai): in dota this value can be actually higher.
                MAX_EDICTS as usize,
                BuildHasherDefault::default(),
            ),
            baseline_entities: HashMap::with_capacity_and_hasher(
                1024,
                BuildHasherDefault::default(),
            ),
            skipped_serializers: HashMap::with_capacity_and_hasher(
                MAX_EDICTS as usize,
                BuildHasherDefault::default(),
            ),

            // NOTE: 4096 is an arbitrary value that is large enough that that came out of printing
            // out count of fps collected per "run". (sort -nr can be handy)
            field_paths: vec![FieldPath::default(); 4096],
        }
    }

    #[allow(dead_code)]
    pub(crate) fn handle_create(
        &mut self,
        index: i32,
        field_decode_ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
        entity_classes: &EntityClasses,
        instance_baseline: &InstanceBaseline,
        serializers: &FlattenedSerializerContainer,
    ) -> Result<i32, EntityParseError> {
        let class_id = br.read_ubit64(entity_classes.bits)?.try_into()?;
        let _serial = br.read_ubit64(NUM_SERIAL_NUM_BITS as usize);
        let _unknown = br.read_uvarint32();

        let class_info = entity_classes
            .by_id(class_id)
            .ok_or(BitError::MalformedVarint)?;
        let serializer = serializers
            .by_name_hash(class_info.network_name_hash)
            .ok_or(BitError::MalformedVarint)?;

        let mut entity = match self.baseline_entities.entry(class_id) {
            Entry::Occupied(oe) => {
                let mut entity = oe.get().clone();
                entity.index = index;
                entity
            }
            Entry::Vacant(ve) => {
                let mut entity = Entity {
                    index,
                    fields: HashMap::with_capacity_and_hasher(
                        serializer.fields.len(),
                        BuildHasherDefault::default(),
                    ),
                    serializer,
                };

                let baseline_data = instance_baseline.by_id(class_id);

                let mut baseline_br = BitReader::new(baseline_data);
                entity.parse(field_decode_ctx, &mut baseline_br, &mut self.field_paths)?;
                baseline_br.is_overflowed()?;

                ve.insert(entity).clone()
            }
        };

        entity.parse(field_decode_ctx, br, &mut self.field_paths)?;

        self.entities.insert(index, entity);
        Ok(index)
    }

    #[cfg_attr(not(feature = "async"), allow(dead_code))]
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn handle_create_with_filter<F>(
        &mut self,
        index: i32,
        field_decode_ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
        entity_classes: &EntityClasses,
        instance_baseline: &InstanceBaseline,
        serializers: &FlattenedSerializerContainer,
        should_track: F,
    ) -> Result<Option<i32>, EntityParseError>
    where
        F: Fn(u64) -> bool,
    {
        let class_id = br.read_ubit64(entity_classes.bits)?.try_into()?;
        let _serial = br.read_ubit64(NUM_SERIAL_NUM_BITS as usize);
        let _unknown = br.read_uvarint32();

        let class_info = entity_classes
            .by_id(class_id)
            .ok_or(BitError::MalformedVarint)?;
        let serializer = serializers
            .by_name_hash(class_info.network_name_hash)
            .ok_or(BitError::MalformedVarint)?;

        let serializer_hash = serializer.serializer_name.hash;

        if !should_track(serializer_hash) {
            skip_entity_fields(&serializer, field_decode_ctx, br, &mut self.field_paths)?;
            self.skipped_serializers.insert(index, serializer);
            return Ok(None);
        }

        let mut entity = match self.baseline_entities.entry(class_id) {
            Entry::Occupied(oe) => {
                let mut entity = oe.get().clone();
                entity.index = index;
                entity
            }
            Entry::Vacant(ve) => {
                let mut entity = Entity {
                    index,
                    fields: HashMap::with_capacity_and_hasher(
                        serializer.fields.len(),
                        BuildHasherDefault::default(),
                    ),
                    serializer,
                };

                let baseline_data = instance_baseline.by_id(class_id);

                let mut baseline_br = BitReader::new(baseline_data);
                entity.parse(field_decode_ctx, &mut baseline_br, &mut self.field_paths)?;
                baseline_br.is_overflowed()?;

                ve.insert(entity).clone()
            }
        };

        entity.parse(field_decode_ctx, br, &mut self.field_paths)?;

        self.entities.insert(index, entity);
        Ok(Some(index))
    }

    // SAFETY: if it's being deleted menas that it was created, riiight? but
    // there's a risk (that only should exist if replay is corrupted).

    pub(crate) fn handle_delete(&mut self, index: i32) -> Option<Entity> {
        self.skipped_serializers.remove(&index);
        self.entities.remove(&index)
    }

    // SAFETY: Same as above... But we also have the risk of entities that leave and come back not
    // re-firing the CREATE event.  May need to handle this differently...
    #[cfg_attr(not(feature = "async"), allow(dead_code))]
    pub(crate) fn handle_leave(&mut self, index: i32) -> Option<Entity> {
        self.skipped_serializers.remove(&index);
        self.entities.remove(&index)
    }

    // SAFETY: if entity was ever created, and not deleted, it can be updated!
    // but there's a risk (that only should exist if replay is corrupted).

    pub(crate) fn handle_update(
        &mut self,
        index: i32,
        field_decode_ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<Option<&Entity>, EntityParseError> {
        // First check if this entity was skipped - if so, skip the update data
        if let Some(serializer) = self.skipped_serializers.get(&index) {
            skip_entity_fields(serializer, field_decode_ctx, br, &mut self.field_paths)?;
            return Ok(None);
        }

        let Some(entity) = self.entities.get_mut(&index) else {
            return Ok(None);
        };
        entity.parse(field_decode_ctx, br, &mut self.field_paths)?;
        Ok(Some(entity))
    }

    // public api
    // ----------

    pub fn iter(&self) -> impl Iterator<Item = (&i32, &Entity)> {
        self.entities.iter()
    }

    #[must_use]
    pub fn get(&self, index: &i32) -> Option<&Entity> {
        self.entities.get(index)
    }

    pub fn iter_baselines(&self) -> impl Iterator<Item = (&i32, &Entity)> {
        self.baseline_entities.iter()
    }

    #[must_use]
    pub fn get_baseline(&self, index: &i32) -> Option<&Entity> {
        self.baseline_entities.get(index)
    }

    // clear clears underlying storage, but this has no effect on the allocated
    // capacity.
    pub fn clear(&mut self) {
        self.entities.clear();
        self.baseline_entities.clear();
        self.skipped_serializers.clear();
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entities.is_empty()
    }
}
