use core::hash::BuildHasherDefault;
use std::sync::Arc;

use dungers::bitbuf::BitError;
use dungers::varint;
use dungers::varint::VarintError;
use hashbrown::HashMap;
use hashbrown::hash_map::Values;
use nohash::NoHashHasher;
use prost::Message;
use valveprotos::common::{
    CDemoSendTables, CsvcMsgFlattenedSerializer, ProtoFlattenedSerializerFieldT,
    ProtoFlattenedSerializerT,
};

use crate::fieldmetadata::{
    FieldMetadata, FieldMetadataError, FieldSpecialDescriptor, get_field_metadata,
};
use crate::fxhash;

#[derive(thiserror::Error, Debug)]
pub enum FlattenedSerializersError {
    #[error(transparent)]
    DecodeError(#[from] prost::DecodeError),
    #[error(transparent)]
    BitError(#[from] BitError),
    #[error(transparent)]
    VarintError(#[from] VarintError),
    #[error(transparent)]
    FieldMetadataError(#[from] FieldMetadataError),
    #[error("symbol not found")]
    SymbolNotFound,
}

// TODO: symbol table / string cache (but do not use servo's string cache
// because it's super slow; it relies on rust-phf that uses sip13 cryptograpgic
// hasher, and you can't replace it with something else (without forking it
// really)).
//
// valve's implementation: public/tier1/utlsymbol.h;
// blukai's 3head implementation:
#[derive(Debug, Clone, Default)]
pub struct Symbol {
    pub hash: u64,
}

impl From<&String> for Symbol {
    fn from(value: &String) -> Self {
        Self {
            hash: fxhash::hash_bytes(value.as_bytes()),
        }
    }
}

// some info about string tables
// https://developer.valvesoftware.com/wiki/Networking_Events_%26_Messages
// https://developer.valvesoftware.com/wiki/Networking_Entities

// TODO: merge string + hash into a single struct or something
//
// TODO: do not clone strings, but reference them instead -> introduce lifetimes
// or build a symbol table from symbols (string cache?)

/// note about missing `field_serializer_version` field (from
/// [`valveprotos::common::ProtoFlattenedSerializerFieldT`]): i did not find any evidence of it
/// being used nor any breakage or data corruptions. it is possible that i missed something. but
/// unless proven otherwise i don't see a reason for incorporating it. field serializers always
/// reference "highest" version of serializer.
///
/// it might be reasonable to actually incorporate it if there will be a need to run this parser in
/// an environment that processes high volumes of replays. theoretically flattened serializers can
/// be parsed once and then reused for future parse passes.
#[derive(Debug, Clone, Default)]
pub struct FlattenedSerializerField {
    pub var_type: Symbol,
    pub var_name: Symbol,
    pub bit_count: Option<i32>,
    pub low_value: Option<f32>,
    pub high_value: Option<f32>,
    pub encode_flags: Option<i32>,
    pub field_serializer_name: Option<Symbol>,
    pub send_node: Option<Symbol>,
    pub var_encoder: Option<Symbol>,

    pub field_serializer: Option<Arc<FlattenedSerializer>>,
    pub(crate) metadata: FieldMetadata,
    pub(crate) key: u64,
}

// TODO: try to split flattened serializer field initialization into 3 clearly separate stages
// (protobuf mapping; metadata; field serializer construction).
impl FlattenedSerializerField {
    fn new(
        msg: &CsvcMsgFlattenedSerializer,
        field: &ProtoFlattenedSerializerFieldT,
    ) -> Result<Self, FieldMetadataError> {
        let resolve_sym = |i: i32| msg.symbols.get(i as usize);

        let var_type = field
            .var_type_sym
            .and_then(resolve_sym)
            .ok_or(FieldMetadataError::FieldNotFound)?;
        let var_name_symbol = Symbol::from(
            field
                .var_name_sym
                .and_then(resolve_sym)
                .ok_or(FieldMetadataError::FieldNotFound)?,
        );
        let mut key = var_name_symbol.hash;

        // NOTE(blukai): send node is like a path for a field.
        //   the field itself is from a different struct that is embedded into this one.
        //   seems to be a result of `CNetworkVarEmbedded` macro work.
        //
        //   deadlock's CCitadelPlayerPawn entity has two m_nHeroID fields.
        //   send_node allows to differentiate them:
        //     - m_CCitadelHeroComponent.m_spawnedHero.m_nHeroID
        //     - m_CCitadelHeroComponent.m_loadingHero.m_nHeroID
        //     where `m_CCitadelHeroComponent.*` is `send_node` and `m_nHeroID` is `var_name`.
        //
        //   examples:
        //     - `m_CCitadelHeroComponent.m_loadingHero`
        //     - `m_CCitadelHeroComponent`
        //     - `m_CHitboxComponent`
        //     - `m_skybox3d.fog`
        //
        //   each component needs to be hashed separately, to be consistent with what
        //   `fkey_from_path` does.
        let send_node = match field.send_node_sym.and_then(resolve_sym) {
            Some(send_node) if !send_node.is_empty() => {
                let mut parts = send_node.split('.');
                let Some(first_part) = parts.next() else {
                    // NOTE(blukai): send_node is not empty.
                    //   even if it contains no `.` at least one part (the original) value is
                    //   there.
                    return Err(FieldMetadataError::FieldNotFound);
                };
                // NOTE(blukai): this needs to match what `fkey_from_path` does.
                let seed = fxhash::hash_bytes(first_part.as_bytes());
                let mut hash = seed;
                for part in parts {
                    let part_hash = fxhash::hash_bytes(part.as_bytes());
                    hash = fxhash::add_u64_to_hash(hash, part_hash);
                }

                key = fxhash::add_u64_to_hash(hash, var_name_symbol.hash);

                Some(Symbol { hash })
            }
            _ => None,
        };

        let mut ret = Self {
            var_type: Symbol::from(var_type),
            var_name: var_name_symbol,
            bit_count: field.bit_count,
            low_value: field.low_value,
            high_value: field.high_value,
            encode_flags: field.encode_flags,
            field_serializer_name: field
                .field_serializer_name_sym
                .and_then(resolve_sym)
                .map(Symbol::from),
            send_node,
            var_encoder: field
                .var_encoder_sym
                .and_then(resolve_sym)
                .map(Symbol::from),

            field_serializer: None,
            metadata: FieldMetadata::default(),
            key,
        };
        ret.metadata = get_field_metadata(&ret, var_type)?;
        Ok(ret)
    }

    #[must_use]
    pub fn get_child(&self, index: usize) -> Option<&Self> {
        self.field_serializer
            .as_ref()
            .and_then(|fs| fs.get_child(index))
    }

    pub(crate) fn var_encoder_heq(&self, rhs: u64) -> bool {
        self.var_encoder.as_ref().is_some_and(|lhs| lhs.hash == rhs)
    }

    #[must_use]
    pub fn is_dynamic_array(&self) -> bool {
        self.metadata
            .special_descriptor
            .as_ref()
            .is_some_and(super::fieldmetadata::FieldSpecialDescriptor::is_dynamic_array)
    }

    /// Returns true if this field is a fixed-size array (e.g. `int32[6]`). Its element fields are
    /// identical clones sharing this field's `var_name`, so element keys are distinguished by
    /// index rather than by name (see `Entity::parse`).
    #[must_use]
    pub fn is_fixed_array(&self) -> bool {
        self.metadata
            .special_descriptor
            .as_ref()
            .is_some_and(super::fieldmetadata::FieldSpecialDescriptor::is_fixed_array)
    }

    /// Returns true if this field is a Pointer type (like `CBodyComponent`).
    /// Pointer fields represent embedded components whose child fields should be
    /// recursively extracted during schema discovery.
    #[must_use]
    pub fn is_pointer(&self) -> bool {
        self.metadata
            .special_descriptor
            .as_ref()
            .is_some_and(super::fieldmetadata::FieldSpecialDescriptor::is_pointer)
    }
}

/// note about missing `serializer_version` field (from
/// [`valveprotos::common::ProtoFlattenedSerializerT`]): entities resolve their serializers by
/// looking up their class info within the [`crate::entityclasses::EntityClasses`] struct (which i
/// parse out of [`valveprotos::common::CDemoClassInfo`] proto).
/// [`valveprotos::common::CDemoClassInfo`] carries absolutely no info about serializer version
/// thus i don't see any need to preserve it.
//
// NOTE: Clone is derived because Entity in entities.rs needs to be clonable which means that all
// members of it also should be clonable.
//
// TODO: why does FlattnedeSerializer need to derive Default?
#[derive(Debug, Clone, Default)]
pub struct FlattenedSerializer {
    pub serializer_name: Symbol,
    pub fields: Vec<Arc<FlattenedSerializerField>>,
}

impl FlattenedSerializer {
    fn new(
        msg: &CsvcMsgFlattenedSerializer,
        fs: &ProtoFlattenedSerializerT,
    ) -> Result<Self, FlattenedSerializersError> {
        let resolve_sym = |i: i32| msg.symbols.get(i as usize);
        let serializer_name = fs
            .serializer_name_sym
            .and_then(resolve_sym)
            .ok_or(FlattenedSerializersError::SymbolNotFound)?;

        Ok(Self {
            serializer_name: Symbol::from(serializer_name),
            fields: Vec::with_capacity(fs.fields_index.len()),
        })
    }

    // NOTE: using this method can hurt performance when used in critical code
    // paths. use the unsafe [`Self::get_child_unchecked`] instead.
    #[must_use]
    pub fn get_child(&self, index: usize) -> Option<&FlattenedSerializerField> {
        self.fields.get(index).map(core::convert::AsRef::as_ref)
    }
}

type FieldMap = HashMap<i32, Arc<FlattenedSerializerField>, BuildHasherDefault<NoHashHasher<i32>>>;
type SerializerMap = HashMap<u64, Arc<FlattenedSerializer>, BuildHasherDefault<NoHashHasher<u64>>>;

pub struct FlattenedSerializerContainer {
    serializer_map: SerializerMap,
}

impl FlattenedSerializerContainer {
    pub fn parse(cmd: CDemoSendTables) -> Result<Self, FlattenedSerializersError> {
        let msg = {
            // TODO: make prost work with ByteString and turn data into Bytes
            //
            // NOTE: calling unwrap_or_default is for some reason faster then
            // relying on prost's default unwrapping by calling .data().
            let mut data = &cmd.data.unwrap_or_default()[..];
            // NOTE: count is useless because read_uvarint32 will "consume"
            // bytes that it'll read from data; size is useless because data
            // supposedly contains only one message.
            //
            // NOTE: there are 2 levels of indirection here, but rust's compiler
            // may optimize them away. but if this will be affecting performance
            // -> createa a function that will be capable of reading varint from
            // &[u8] without multiple levels of indirection.
            let (_size, _count) = varint::read_uvarint64(&mut data)?;
            CsvcMsgFlattenedSerializer::decode(data)?
        };

        let mut field_map: FieldMap =
            FieldMap::with_capacity_and_hasher(msg.fields.len(), BuildHasherDefault::default());
        let mut serializer_map: SerializerMap = SerializerMap::with_capacity_and_hasher(
            msg.serializers.len(),
            BuildHasherDefault::default(),
        );

        for serializer in &msg.serializers {
            let mut flattened_serializer = FlattenedSerializer::new(&msg, serializer)?;

            for field_index in &serializer.fields_index {
                if let Some(field) = field_map.get(field_index) {
                    flattened_serializer.fields.push(field.clone());
                    continue;
                }

                let mut field =
                    FlattenedSerializerField::new(&msg, &msg.fields[*field_index as usize])?;

                field.field_serializer = match field.metadata.special_descriptor {
                    Some(FieldSpecialDescriptor::FixedArray { length }) => {
                        let mut field = field.clone();
                        field.field_serializer = field
                            .field_serializer_name
                            .as_ref()
                            .and_then(|symbol| serializer_map.get(&symbol.hash).cloned());
                        Some(Arc::new(FlattenedSerializer {
                            fields: {
                                let mut fields = Vec::with_capacity(length);
                                fields.resize(length, Arc::new(field));
                                fields
                            },
                            ..Default::default()
                        }))
                    }
                    Some(FieldSpecialDescriptor::DynamicArray { ref decoder }) => {
                        let field = FlattenedSerializerField {
                            metadata: FieldMetadata {
                                decoder: decoder.clone(),
                                ..Default::default()
                            },
                            ..Default::default()
                        };
                        Some(Arc::new(FlattenedSerializer {
                            fields: vec![Arc::new(field)],
                            ..Default::default()
                        }))
                    }
                    Some(FieldSpecialDescriptor::DynamicSerializerArray) => {
                        let field = FlattenedSerializerField {
                            field_serializer: field
                                .field_serializer_name
                                .as_ref()
                                .and_then(|symbol| serializer_map.get(&symbol.hash).cloned()),
                            ..Default::default()
                        };
                        Some(Arc::new(FlattenedSerializer {
                            fields: vec![Arc::new(field)],
                            ..Default::default()
                        }))
                    }
                    _ => field
                        .field_serializer_name
                        .as_ref()
                        .and_then(|symbol| serializer_map.get(&symbol.hash).cloned()),
                };

                let field = Arc::new(field);
                field_map.insert(*field_index, field.clone());
                flattened_serializer.fields.push(field);
            }

            serializer_map.insert(
                flattened_serializer.serializer_name.hash,
                Arc::new(flattened_serializer),
            );
        }

        Ok(Self { serializer_map })
    }

    // TODO: think about exposing the whole serializer map
    #[must_use]
    pub fn by_name_hash(&self, serializer_name_hash: u64) -> Option<Arc<FlattenedSerializer>> {
        self.serializer_map.get(&serializer_name_hash).cloned()
    }

    #[must_use]
    pub fn values(&self) -> Values<'_, u64, Arc<FlattenedSerializer>> {
        self.serializer_map.values()
    }
}
