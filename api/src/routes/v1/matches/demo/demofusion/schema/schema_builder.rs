use std::collections::HashSet;
use std::sync::Arc;

use datafusion::arrow::datatypes::{DataType, Field, Schema};

use super::type_mapping::{FieldType, parse_var_type};

#[derive(Clone, Debug)]
pub(crate) struct EntitySchema {
    pub(crate) serializer_name: Arc<str>,
    pub(crate) serializer_hash: u64,
    pub(crate) arrow_schema: Arc<Schema>,
    pub(crate) field_keys: Vec<u64>,
    pub(crate) field_column_counts: Vec<usize>,
    /// One entry per entity field (parallel to `field_keys`), describing how to read
    /// that field's value(s) out of an entity.
    pub(crate) field_kinds: Vec<FieldKind>,
}

/// How an entity field's value(s) are materialized into its Arrow column(s).
#[derive(Clone, Debug)]
pub(crate) enum FieldKind {
    /// Read the single value at the field key. Covers scalars (1 column), split vectors
    /// (N component columns), and fixed-size arrays (1 column — see note below).
    ///
    /// Fixed-size arrays decode to a single colliding key in haste (every element shares the
    /// array field's `var_name` hash), so only the last-written element survives. They are
    /// emitted as a (null, in practice) `FixedSizeList` column rather than reconstructed.
    Plain,
    /// An array materialized as `List` column(s). One [`ElemExtract`] per emitted Arrow column
    /// describes how to pull that column's value out of each element; `len` says how many
    /// elements to read.
    DynList {
        extracts: Vec<ElemExtract>,
        len: ArrayLen,
    },
}

/// How the element count of an array field is determined.
#[derive(Clone, Copy, Debug)]
pub(crate) enum ArrayLen {
    /// Dynamic array: the field key holds a `U64` element count.
    Dynamic,
    /// Fixed-size array (e.g. `int32[6]`): a statically known length, read at indices `0..n`.
    Fixed(usize),
}

/// How to extract one Arrow list column's per-element value from a dynamic array element.
///
/// Element `i` of an array based at `base` lives at `add_u64_to_hash(base, add_u64_to_hash(0, i))`.
#[derive(Clone, Debug)]
pub(crate) enum ElemExtract {
    /// The element value itself (primitive arrays).
    Whole,
    /// Component `n` of a vector-valued element (vector arrays split into per-axis lists).
    Component(usize),
    /// A leaf of a struct-valued element (embedded-serializer arrays). `steps` are the
    /// `var_name` hashes folded onto the element key to reach the leaf; `comp` optionally
    /// selects a vector component of that leaf.
    SubKey {
        steps: Vec<u64>,
        comp: Option<usize>,
    },
}

pub(crate) fn build_schema(
    serializer_name: &str,
    serializer_hash: u64,
    fields: &[FieldInfo],
) -> EntitySchema {
    let mut arrow_fields = Vec::new();
    let mut field_keys = Vec::new();
    let mut field_column_counts = Vec::new();
    let mut field_kinds = Vec::new();
    let mut seen_names: HashSet<String> = HashSet::new();

    arrow_fields.push(Field::new("tick", DataType::Int32, false));
    arrow_fields.push(Field::new("entity_index", DataType::Int32, false));
    arrow_fields.push(Field::new("delta_type", DataType::Utf8, false));
    seen_names.insert("tick".to_string());
    seen_names.insert("entity_index".to_string());
    seen_names.insert("delta_type".to_string());

    for field_info in fields {
        let base_name = super::symbol_table::build_field_name(
            field_info.send_node.as_deref(),
            &field_info.var_name,
        );

        // Dynamic arrays expand into one or more `List<scalar>` columns (vectors split per axis,
        // structs flattened per leaf), each reconstructed element-by-element at collect time.
        if let Some(array) = &field_info.array {
            let mut extracts = Vec::with_capacity(array.columns.len());
            for col in &array.columns {
                let name = format!("{base_name}{}", col.suffix);
                if seen_names.contains(&name) {
                    continue;
                }
                let item = Field::new("item", col.element_type.clone(), true);
                arrow_fields.push(Field::new(&name, DataType::List(Arc::new(item)), true));
                seen_names.insert(name);
                extracts.push(col.extract.clone());
            }
            if extracts.is_empty() {
                continue;
            }
            field_keys.push(field_info.key);
            field_column_counts.push(extracts.len());
            field_kinds.push(FieldKind::DynList {
                extracts,
                len: array.len,
            });
            continue;
        }

        let field_type = parse_var_type(&field_info.var_type);
        match &field_type {
            FieldType::Vector2 { base }
            | FieldType::Vector3 { base }
            | FieldType::Vector4 { base } => {
                let suffixes = field_type.component_suffixes();
                let names: Vec<String> = suffixes
                    .iter()
                    .map(|suffix| format!("{base_name}{suffix}"))
                    .collect();
                if names.iter().any(|name| seen_names.contains(name)) {
                    continue;
                }
                for name in names {
                    arrow_fields.push(Field::new(&name, base.clone(), true));
                    seen_names.insert(name);
                }
                field_keys.push(field_info.key);
                field_column_counts.push(suffixes.len());
                field_kinds.push(FieldKind::Plain);
            }
            FieldType::Nested { .. } => {}
            _ => {
                if seen_names.contains(&base_name) {
                    continue;
                }
                arrow_fields.push(Field::new(&base_name, field_type.to_arrow_type(), true));
                seen_names.insert(base_name);
                field_keys.push(field_info.key);
                field_column_counts.push(1);
                field_kinds.push(FieldKind::Plain);
            }
        }
    }

    EntitySchema {
        serializer_name: Arc::from(serializer_name),
        serializer_hash,
        arrow_schema: Arc::new(Schema::new(arrow_fields)),
        field_keys,
        field_column_counts,
        field_kinds,
    }
}

#[derive(Debug, Clone)]
pub(crate) struct FieldInfo {
    var_name: String,
    var_type: String,
    send_node: Option<String>,
    key: u64,
    /// Set when this field is a dynamic array; describes the list columns it expands into.
    pub(crate) array: Option<ArrayInfo>,
}

/// An array field's expansion into one or more `List` columns.
#[derive(Debug, Clone)]
pub(crate) struct ArrayInfo {
    pub(crate) columns: Vec<ArrayColumn>,
    pub(crate) len: ArrayLen,
}

/// One `List<element_type>` column produced from a dynamic array field.
#[derive(Debug, Clone)]
pub(crate) struct ArrayColumn {
    /// Appended to the field's base name (e.g. `""`, `"__x"`, `"__m_flValue"`).
    pub(crate) suffix: String,
    /// Arrow type of the list's elements.
    pub(crate) element_type: DataType,
    pub(crate) extract: ElemExtract,
}

impl FieldInfo {
    pub(crate) fn new(
        var_name: String,
        var_type: String,
        send_node: Option<String>,
        key: u64,
    ) -> Self {
        Self {
            var_name,
            var_type,
            send_node,
            key,
            array: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_simple_schema() {
        let fields = vec![
            FieldInfo::new("m_iHealth".to_string(), "int32".to_string(), None, 1),
            FieldInfo::new("m_vecOrigin".to_string(), "Vector".to_string(), None, 2),
        ];

        let schema = build_schema("TestEntity", 12345, &fields);

        assert_eq!(&*schema.serializer_name, "TestEntity");
        assert_eq!(schema.arrow_schema.fields().len(), 3 + 1 + 3);

        let field_names: Vec<_> = schema
            .arrow_schema
            .fields()
            .iter()
            .map(|f| f.name().as_str())
            .collect();

        assert!(field_names.contains(&"tick"));
        assert!(field_names.contains(&"entity_index"));
        assert!(field_names.contains(&"delta_type"));
        assert!(field_names.contains(&"m_iHealth"));
        assert!(field_names.contains(&"m_vecOrigin__x"));
        assert!(field_names.contains(&"m_vecOrigin__y"));
        assert!(field_names.contains(&"m_vecOrigin__z"));
    }

    #[test]
    fn test_schema_with_send_node() {
        let fields = vec![FieldInfo::new(
            "m_nHeroID".to_string(),
            "int32".to_string(),
            Some("m_CCitadelHeroComponent.m_loadingHero".to_string()),
            1,
        )];

        let schema = build_schema("CCitadelPlayerPawn", 12345, &fields);

        let field_names: Vec<_> = schema
            .arrow_schema
            .fields()
            .iter()
            .map(|f| f.name().as_str())
            .collect();

        assert!(field_names.contains(&"m_CCitadelHeroComponent__m_loadingHero__m_nHeroID"));
    }

    #[test]
    fn test_array_field_expands_to_list_columns() {
        // A vector array expands into one List<Float32> column per component.
        let mut field = FieldInfo::new(
            "m_PathNodes".to_string(),
            "CNetworkUtlVectorBase< Vector >".to_string(),
            None,
            42,
        );
        field.array = Some(ArrayInfo {
            columns: vec![
                ArrayColumn {
                    suffix: "__x".to_string(),
                    element_type: DataType::Float32,
                    extract: ElemExtract::Component(0),
                },
                ArrayColumn {
                    suffix: "__y".to_string(),
                    element_type: DataType::Float32,
                    extract: ElemExtract::Component(1),
                },
            ],
            len: ArrayLen::Dynamic,
        });

        let schema = build_schema("E", 1, &[field]);

        let list_f32 = DataType::List(Arc::new(Field::new("item", DataType::Float32, true)));
        let x = schema
            .arrow_schema
            .field_with_name("m_PathNodes__x")
            .unwrap();
        assert_eq!(x.data_type(), &list_f32);
        assert!(
            schema
                .arrow_schema
                .field_with_name("m_PathNodes__y")
                .is_ok()
        );

        // One entity field, two columns, keyed at the base, materialized as a dynamic list.
        assert_eq!(schema.field_keys, vec![42]);
        assert_eq!(schema.field_column_counts, vec![2]);
        assert!(matches!(
            schema.field_kinds.as_slice(),
            [FieldKind::DynList { extracts, .. }] if extracts.len() == 2
        ));
    }
}
