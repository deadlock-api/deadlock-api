use core::marker::PhantomData;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use haste_core::demostream::{CmdHeader, DemoStream};
use haste_core::flattenedserializers::{FlattenedSerializer, FlattenedSerializerField};
use haste_core::parser::{Context, Visitor};
use haste_core::valveprotos::common::EDemoCommands;
use prost::Message;

use super::super::error::{Error, Result};
use super::super::schema::type_mapping::{FieldType, parse_var_type};
use super::super::schema::{
    ArrayColumn, ArrayInfo, ArrayLen, ElemExtract, EntitySchema, FieldInfo, SymbolTable,
    build_schema, compute_field_key,
};
use super::BuildStream;

/// Extracts serializer symbols from a demo's send-tables. Generic over the stream format `D` so the
/// raw send-tables body is unwrapped the format's own way (demo files wrap it in a protobuf
/// `CDemoSendTables`; broadcasts prefix it with four raw bytes) via [`DemoStream::decode_cmd_send_tables`].
struct SchemaDiscoveryVisitor<D> {
    symbols: Arc<Mutex<Option<Vec<String>>>>,
    _marker: PhantomData<fn() -> D>,
}

impl<D> SchemaDiscoveryVisitor<D> {
    fn new() -> Self {
        Self {
            symbols: Arc::new(Mutex::new(None)),
            _marker: PhantomData,
        }
    }

    fn symbols_handle(&self) -> Arc<Mutex<Option<Vec<String>>>> {
        self.symbols.clone()
    }
}

impl<D: DemoStream> Visitor for SchemaDiscoveryVisitor<D> {
    type Error = Error;

    fn on_cmd(
        &mut self,
        _ctx: &Context,
        cmd_header: &CmdHeader,
        data: &[u8],
    ) -> core::result::Result<(), Self::Error> {
        match cmd_header.cmd {
            EDemoCommands::DemSendTables => {
                if let Ok(symbols) = extract_symbols_from_send_tables::<D>(data)
                    && let Ok(mut guard) = self.symbols.lock()
                {
                    *guard = Some(symbols);
                }
            }
            // Send tables arrive before the first sync tick; erroring here aborts
            // the parse early (the caller discards this value) so schema discovery
            // never decodes the gameplay body.
            EDemoCommands::DemSyncTick => {
                return Err(Error::Schema("schema discovery complete".into()));
            }
            _ => {}
        }
        Ok(())
    }
}

fn extract_symbols_from_send_tables<D: DemoStream>(data: &[u8]) -> Result<Vec<String>> {
    use haste_core::valveprotos::common::CsvcMsgFlattenedSerializer;

    let send_tables = D::decode_cmd_send_tables(data)
        .map_err(|e| Error::Schema(format!("Failed to decode send tables: {e}")))?;

    let raw_data = send_tables.data.unwrap_or_default();
    let mut data_slice = &raw_data[..];

    skip_uvarint64(&mut data_slice)
        .map_err(|e| Error::Schema(format!("Failed to read varint: {e}")))?;

    let msg = CsvcMsgFlattenedSerializer::decode(data_slice)
        .map_err(|e| Error::Schema(format!("Failed to decode flattened serializer: {e}")))?;

    Ok(msg.symbols)
}

/// Advances `data` past a LEB128 uvarint without returning the decoded value.
fn skip_uvarint64(data: &mut &[u8]) -> core::result::Result<(), &'static str> {
    let mut shift = 0u32;
    loop {
        let (&byte, rest) = data.split_first().ok_or("unexpected end of data")?;
        *data = rest;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift >= 64 {
            return Err("varint too long");
        }
    }
    Ok(())
}

/// Build an entity schema for every serializer in the parsed context.
///
/// Nested serializers (e.g. `CBodyComponent`) are flattened into columns like
/// `CBodyComponent__m_cellX`, matching how the parser stores field values under
/// composite keys.
fn build_schemas(
    ctx: &Context,
    symbols: Vec<String>,
    wanted: Option<&HashSet<String>>,
) -> Result<Vec<EntitySchema>> {
    let symbol_table = SymbolTable::new(symbols);

    let serializers = ctx
        .serializers()
        .ok_or_else(|| Error::Schema("No serializers in context".to_string()))?;

    let mut schemas = Vec::new();
    for serializer in serializers.values() {
        let Some(serializer_name) = symbol_table.resolve(serializer.serializer_name.hash) else {
            continue;
        };
        // Building an Arrow schema (field flattening, type mapping, name dedup) is the expensive
        // part; when a filter is given, skip serializers the query never touches.
        if let Some(wanted) = wanted
            && !wanted.contains(serializer_name)
        {
            continue;
        }

        let mut fields = Vec::new();
        collect_fields_recursive(serializer, &symbol_table, None, None, &mut fields, 0);

        schemas.push(build_schema(
            serializer_name,
            serializer.serializer_name.hash,
            &fields,
        ));
    }

    Ok(schemas)
}

/// Maximum recursion depth for nested serializers to prevent infinite loops.
/// In practice, Source 2 demos rarely have more than 2-3 levels of nesting.
const MAX_NESTED_DEPTH: usize = 5;

/// Recursively collects fields from a serializer, including nested fields from
/// embedded components like `CBodyComponent`.
fn collect_fields_recursive(
    serializer: &FlattenedSerializer,
    symbol_table: &SymbolTable,
    parent_path: Option<&str>,
    parent_key: Option<u64>,
    fields: &mut Vec<FieldInfo>,
    depth: usize,
) {
    if depth > MAX_NESTED_DEPTH {
        return;
    }

    for field in &serializer.fields {
        // Pointer fields (e.g. CBodyComponent) hold a nested serializer and act as
        // a presence bool: don't emit the field itself, only recurse into its leaves.
        if let Some(nested_serializer) = &field.field_serializer
            && field.is_pointer()
        {
            let Some(var_name) = symbol_table.resolve(field.var_name.hash) else {
                continue;
            };

            let nested_path = match parent_path {
                Some(pp) => format!("{pp}.{var_name}"),
                None => var_name.to_string(),
            };

            // Composite key must match how the parser builds field_key in entities.rs.
            let nested_key = match parent_key {
                Some(pk) => haste_core::fxhash::add_u64_to_hash(pk, field.var_name.hash),
                None => field.var_name.hash,
            };

            collect_fields_recursive(
                nested_serializer,
                symbol_table,
                Some(&nested_path),
                Some(nested_key),
                fields,
                depth + 1,
            );
            continue;
        }

        if let Some(field_info) = extract_field_info(field, symbol_table, parent_path, parent_key) {
            fields.push(field_info);
        }
    }
}

/// Extracts a `FieldInfo` from a single field, applying parent path prefix if present.
fn extract_field_info(
    field: &FlattenedSerializerField,
    symbol_table: &SymbolTable,
    parent_path: Option<&str>,
    parent_key: Option<u64>,
) -> Option<FieldInfo> {
    let var_name = symbol_table.resolve(field.var_name.hash)?;
    let var_type = symbol_table.resolve(field.var_type.hash)?;

    let field_send_node = field
        .send_node
        .as_ref()
        .and_then(|sn| symbol_table.resolve(sn.hash));

    let send_node = match (parent_path, field_send_node) {
        (Some(pp), Some(sn)) => Some(format!("{pp}.{sn}")),
        (Some(pp), None) => Some(pp.to_string()),
        (None, Some(sn)) => Some(sn.to_string()),
        (None, None) => None,
    };

    // Composite key must match how the parser computes field_key in entities.rs.
    let key = match parent_key {
        Some(pk) => haste_core::fxhash::add_u64_to_hash(pk, field.var_name.hash),
        None => compute_field_key(send_node.as_deref(), var_name),
    };

    let array = build_array_info(field, symbol_table, var_type);
    let mut field_info = FieldInfo::new(var_name.to_string(), var_type.to_string(), send_node, key);
    field_info.array = array;
    Some(field_info)
}

/// Describe how an array field expands into `List` columns, or `None` if it is not an array
/// (or can't be represented, in which case it falls back to a single null list).
///
/// Element `i` lives at `add(base_key, add(0, i))` for both dynamic and fixed arrays (haste keys
/// fixed-array elements by index too). Primitive arrays expose the element directly; vector arrays
/// split into per-axis lists; embedded-serializer arrays (`field_serializer` → wrapper → element
/// serializer `T`) flatten `T`'s leaves into one list column each.
fn build_array_info(
    field: &FlattenedSerializerField,
    symbol_table: &SymbolTable,
    var_type: &str,
) -> Option<ArrayInfo> {
    let (element, len) = match parse_var_type(var_type) {
        FieldType::DynamicArray { element } => (element, ArrayLen::Dynamic),
        FieldType::FixedArray { element, length } => (element, ArrayLen::Fixed(length)),
        _ => return None,
    };

    if let Some(elem_ser) = field
        .field_serializer
        .as_ref()
        .and_then(|wrapper| wrapper.fields.first())
        .and_then(|inner| inner.field_serializer.as_ref())
    {
        let mut columns = Vec::new();
        collect_struct_leaves(elem_ser, symbol_table, &mut Vec::new(), "", &mut columns, 0);
        return (!columns.is_empty()).then_some(ArrayInfo { columns, len });
    }

    let columns = match element.as_ref() {
        FieldType::Vector2 { base } | FieldType::Vector3 { base } | FieldType::Vector4 { base } => {
            element
                .component_suffixes()
                .iter()
                .enumerate()
                .map(|(c, suffix)| ArrayColumn {
                    suffix: (*suffix).to_string(),
                    element_type: base.clone(),
                    extract: ElemExtract::Component(c),
                })
                .collect()
        }
        // Serializer element with no resolvable inner serializer: leave it to the null-list fallback.
        FieldType::Nested { .. } => return None,
        other => vec![ArrayColumn {
            suffix: String::new(),
            element_type: other.to_arrow_type(),
            extract: ElemExtract::Whole,
        }],
    };
    Some(ArrayInfo { columns, len })
}

/// Flatten an embedded-array element serializer's leaves into one [`ArrayColumn`] each.
///
/// `steps` are the `var_name` hashes folded onto the element key to reach the current position
/// (mirroring haste's positional field-path walk); `name_prefix` is the matching column-name
/// prefix.
fn collect_struct_leaves(
    serializer: &FlattenedSerializer,
    symbol_table: &SymbolTable,
    steps: &mut Vec<u64>,
    name_prefix: &str,
    out: &mut Vec<ArrayColumn>,
    depth: usize,
) {
    if depth > MAX_NESTED_DEPTH {
        return;
    }
    for tf in &serializer.fields {
        let Some(var_name) = symbol_table.resolve(tf.var_name.hash) else {
            continue;
        };
        let Some(var_type) = symbol_table.resolve(tf.var_type.hash) else {
            continue;
        };
        let ft = parse_var_type(var_type);

        // Nested arrays inside a struct element aren't represented.
        if matches!(
            ft,
            FieldType::DynamicArray { .. } | FieldType::FixedArray { .. }
        ) {
            continue;
        }

        // Embedded sub-struct (pointer or value): recurse positionally, folding its var_name hash.
        if let Some(sub) = tf.field_serializer.as_ref()
            && matches!(ft, FieldType::Nested { .. })
        {
            steps.push(tf.var_name.hash);
            let prefix = format!("{name_prefix}__{var_name}");
            collect_struct_leaves(sub, symbol_table, steps, &prefix, out, depth + 1);
            steps.pop();
            continue;
        }

        let mut leaf_steps = steps.clone();
        leaf_steps.push(tf.var_name.hash);
        match &ft {
            FieldType::Vector2 { base }
            | FieldType::Vector3 { base }
            | FieldType::Vector4 { base } => {
                for (c, suffix) in ft.component_suffixes().iter().enumerate() {
                    out.push(ArrayColumn {
                        suffix: format!("{name_prefix}__{var_name}{suffix}"),
                        element_type: base.clone(),
                        extract: ElemExtract::SubKey {
                            steps: leaf_steps.clone(),
                            comp: Some(c),
                        },
                    });
                }
            }
            // Unresolvable nested serializer (no field_serializer to recurse): skip.
            FieldType::Nested { .. } => {}
            other => out.push(ArrayColumn {
                suffix: format!("{name_prefix}__{var_name}"),
                element_type: other.to_arrow_type(),
                extract: ElemExtract::SubKey {
                    steps: leaf_steps,
                    comp: None,
                },
            }),
        }
    }
}

/// Discover entity schemas from a demo, parsing its send-tables to extract serializer definitions
/// and building Arrow schemas for each referenced entity type. Generic over the stream format `D`.
pub(crate) fn discover_schemas_from_demo<D: BuildStream>(
    data: bytes::Bytes,
    wanted: &HashSet<String>,
) -> Result<Vec<EntitySchema>> {
    discover_schemas::<D>(data, Some(wanted))
}

/// Like [`discover_schemas_from_demo`], but builds Arrow schemas for *every* entity
/// serializer in the demo rather than only a wanted subset.
pub(crate) fn discover_all_schemas_from_demo<D: BuildStream>(
    data: bytes::Bytes,
) -> Result<Vec<EntitySchema>> {
    discover_schemas::<D>(data, None)
}

fn discover_schemas<D: BuildStream>(
    data: bytes::Bytes,
    wanted: Option<&HashSet<String>>,
) -> Result<Vec<EntitySchema>> {
    let visitor = SchemaDiscoveryVisitor::<D>::new();
    let symbols_handle = visitor.symbols_handle();

    let mut parser =
        super::sync_parser::<D, _>(data, visitor).map_err(|e| Error::Schema(e.to_string()))?;

    // Run until schema discovery completes (at DEM_SyncTick)
    let _ = parser.run_to_end();

    let symbols = symbols_handle
        .lock()
        .map_err(|_| Error::Schema("Failed to lock symbols".to_string()))?
        .take()
        // No send-tables seen before the input ran out: the caller gave us a prefix
        // that stops short of the schema. Signal "need more bytes" distinctly.
        .ok_or(Error::IncompleteDemo)?;

    build_schemas(parser.context(), symbols, wanted)
}
