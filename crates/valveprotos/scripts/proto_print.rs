//! Prints decoded descriptors as `.proto` text, line for line as `SteamRE`'s `ProtobufDumper`
//! does (<https://github.com/SteamRE/SteamKit/blob/master/Resources/ProtobufDumper/ProtobufDumper/ProtobufDumper.cs>),
//! so the output matches `SteamDatabase/Protobufs` byte for byte.

use core::fmt::Write as _;
use std::collections::{BTreeSet, HashMap};

use crate::proto_dump::{
    EnumDesc, FieldDesc, FileDesc, MessageDesc, Options, OptionsKind, Raw, ServiceDesc, Wire,
    int32, read_fields, read_varint,
};

const TYPE_DOUBLE: i32 = 1;
const TYPE_FLOAT: i32 = 2;
const TYPE_INT64: i32 = 3;
const TYPE_UINT64: i32 = 4;
const TYPE_INT32: i32 = 5;
const TYPE_FIXED64: i32 = 6;
const TYPE_FIXED32: i32 = 7;
const TYPE_BOOL: i32 = 8;
const TYPE_STRING: i32 = 9;
const TYPE_GROUP: i32 = 10;
const TYPE_MESSAGE: i32 = 11;
const TYPE_BYTES: i32 = 12;
const TYPE_UINT32: i32 = 13;
const TYPE_ENUM: i32 = 14;
const TYPE_SFIXED32: i32 = 15;
const TYPE_SFIXED64: i32 = 16;
const TYPE_SINT32: i32 = 17;
const TYPE_SINT64: i32 = 18;

const LABEL_REQUIRED: i32 = 2;
const LABEL_REPEATED: i32 = 3;

const MAX_FIELD_NUMBER: i32 = 536_870_911;

type Result<T> = core::result::Result<T, String>;
type OptionList = Vec<(String, String)>;

#[derive(Debug, Clone, Copy)]
enum Source<'a> {
    Message(&'a MessageDesc),
    Enum(&'a EnumDesc),
    Field(&'a FieldDesc),
    Service,
}

#[derive(Debug, Clone, Copy, Default)]
struct TypeNode<'a> {
    /// index of the file that defines it
    file: Option<usize>,
    source: Option<Source<'a>>,
}

/// Every type and extension by full name (`.pkg.Msg.Nested`), in the order `ProtobufDumper` first
/// sees them: extension options are printed in this order.
#[derive(Debug, Default)]
struct TypeMap<'a> {
    order: Vec<String>,
    nodes: HashMap<String, TypeNode<'a>>,
}

impl<'a> TypeMap<'a> {
    fn add(&mut self, name: String, defined: Option<(usize, Source<'a>)>) {
        if let Some(node) = self.nodes.get_mut(&name) {
            if let Some((file, source)) = defined {
                node.file = Some(file);
                node.source = Some(source);
            }
            return;
        }
        let node = defined.map_or_else(TypeNode::default, |(file, source)| TypeNode {
            file: Some(file),
            source: Some(source),
        });
        self.order.push(name.clone());
        self.nodes.insert(name, node);
    }

    fn source(&self, name: &str) -> Result<Source<'a>> {
        self.nodes
            .get(name)
            .and_then(|node| node.source)
            .ok_or_else(|| format!("type {name} is not defined"))
    }
}

fn package_path(package: &str, name: &str) -> String {
    if name.starts_with('.') {
        name.to_owned()
    } else if package.is_empty() || package.starts_with('.') {
        format!("{package}.{name}")
    } else {
        format!(".{package}.{name}")
    }
}

fn non_empty(value: Option<&String>) -> Option<&str> {
    value.map(String::as_str).filter(|v| !v.is_empty())
}

const fn is_named(kind: i32) -> bool {
    kind == TYPE_MESSAGE || kind == TYPE_ENUM
}

/// Output lines and the imports the options need.
#[derive(Debug, Default)]
struct Out {
    lines: Vec<String>,
    option_imports: BTreeSet<String>,
}

impl Out {
    fn push(&mut self, line: String) {
        self.lines.push(line);
    }

    fn heading(&mut self, marker: &mut bool) {
        if *marker {
            self.lines.push(String::new());
            *marker = false;
        }
    }
}

#[derive(Debug)]
pub(crate) struct Dumper<'a> {
    files: &'a [FileDesc],
    types: TypeMap<'a>,
    /// per file: the files whose types it can see (its imports and their public imports)
    visible: Vec<Vec<usize>>,
}

impl<'a> Dumper<'a> {
    /// Indexes all types; fails like `ProtobufDumper`'s `Analyze` when a dependency or a referenced
    /// type is missing from the scanned binaries.
    pub(crate) fn new(files: &'a [FileDesc]) -> Result<Self> {
        let mut types = TypeMap::default();
        for (index, file) in files.iter().enumerate() {
            let package = file.package.as_deref().unwrap_or_default();
            for ext in &file.extension {
                add_extension(&mut types, index, package, package, ext);
            }
            for desc in &file.enum_type {
                types.add(
                    package_path(package, &desc.name),
                    Some((index, Source::Enum(desc))),
                );
            }
            for desc in &file.message_type {
                add_message(&mut types, index, package, desc);
            }
            for service in &file.service {
                types.add(
                    package_path(package, &service.name),
                    Some((index, Source::Service)),
                );
                for method in &service.method {
                    for name in [&method.input_type, &method.output_type] {
                        if let Some(name) = non_empty(name.as_ref()) {
                            types.add(package_path(package, name), None);
                        }
                    }
                }
            }
        }

        let by_name: HashMap<&str, usize> = files
            .iter()
            .enumerate()
            .map(|(i, f)| (f.name.as_str(), i))
            .collect();
        for file in files {
            for dep in &file.dependency {
                if !dep.starts_with("google") && !by_name.contains_key(dep.as_str()) {
                    return Err(format!("dependency {dep} of {} was not found", file.name));
                }
            }
        }
        let undefined: Vec<&str> = types
            .order
            .iter()
            .filter(|name| types.nodes.get(*name).is_none_or(|n| n.source.is_none()))
            .map(String::as_str)
            .collect();
        if !undefined.is_empty() {
            return Err(format!("types not found: {}", undefined.join(", ")));
        }

        let visible = files
            .iter()
            .map(|file| {
                let mut set = Vec::new();
                add_visible(files, &by_name, &mut set, file, true);
                set
            })
            .collect();
        Ok(Self {
            files,
            types,
            visible,
        })
    }

    /// The `.proto` text of every file, by file name.
    pub(crate) fn dump_all(&self) -> Result<Vec<(String, String)>> {
        self.files
            .iter()
            .enumerate()
            .map(|(index, file)| Ok((file.name.clone(), self.dump_file(index, file)?)))
            .collect()
    }

    fn dump_file(&self, index: usize, file: &FileDesc) -> Result<String> {
        let mut out = Out::default();
        let mut marker = false;
        if let Some(syntax) = non_empty(file.syntax.as_ref()) {
            out.heading(&mut marker);
            out.push(format!("syntax = {};", literal(syntax)));
            marker = true;
        }
        for (i, dep) in file.dependency.iter().enumerate() {
            let i = i32::try_from(i).unwrap_or(i32::MAX);
            let modifier = if file.public_dependency.contains(&i) {
                "public "
            } else if file.weak_dependency.contains(&i) {
                "weak "
            } else {
                ""
            };
            out.push(format!("import {modifier}\"{dep}\";"));
            marker = true;
        }
        let imports_end = out.lines.len();
        let has_heading = marker;

        if let Some(package) = non_empty(file.package.as_ref()) {
            out.heading(&mut marker);
            out.push(format!("package {package};"));
            marker = true;
        }
        let options = self.options(index, file.options.as_ref(), &mut out)?;
        for (key, value) in &options {
            out.heading(&mut marker);
            out.push(format!("option {key} = {value};"));
        }
        if !options.is_empty() {
            marker = true;
        }
        self.extensions(index, &file.extension, 0, &mut out, &mut marker)?;
        for desc in &file.enum_type {
            self.enumeration(index, desc, 0, &mut out, &mut marker)?;
        }
        for desc in &file.message_type {
            self.message(index, desc, 0, &mut out, &mut marker)?;
        }
        for service in &file.service {
            self.service(index, service, &mut out, &mut marker)?;
        }

        // Valve's protoc has the options of its descriptor.proto built in, so the binary doesn't
        // list the import, but any other protoc only knows them when the file imports it
        let mut lines = out.lines;
        if !out.option_imports.is_empty() {
            let mut imports: Vec<String> = out
                .option_imports
                .iter()
                .map(|import| format!("import \"{import}\";"))
                .collect();
            if !has_heading && imports_end < lines.len() {
                imports.push(String::new());
            }
            let tail: Vec<String> = lines.drain(imports_end..).collect();
            lines.extend(imports);
            lines.extend(tail);
        }
        let mut text = String::new();
        for line in lines {
            text.push_str(&line);
            text.push('\n');
        }
        Ok(text)
    }

    fn extensions(
        &self,
        file: usize,
        fields: &[FieldDesc],
        level: usize,
        out: &mut Out,
        marker: &mut bool,
    ) -> Result<()> {
        let indent = "\t".repeat(level);
        let mut groups: Vec<(&str, Vec<&FieldDesc>)> = Vec::new();
        for field in fields {
            let extendee = field.extendee.as_deref().unwrap_or_default();
            match groups.iter_mut().find(|(name, _)| *name == extendee) {
                Some((_, group)) => group.push(field),
                None => groups.push((extendee, vec![field])),
            }
        }
        for (extendee, group) in groups {
            if extendee.is_empty() {
                return Err("an extension has no extendee".to_owned());
            }
            out.heading(marker);
            out.push(format!("{indent}extend {extendee} {{"));
            for field in group {
                let decl = self.declaration(file, field, true, out)?;
                out.push(format!("{indent}\t{decl}"));
            }
            out.push(format!("{indent}}}"));
            *marker = true;
        }
        Ok(())
    }

    fn message(
        &self,
        file: usize,
        desc: &MessageDesc,
        level: usize,
        out: &mut Out,
        marker: &mut bool,
    ) -> Result<()> {
        let indent = "\t".repeat(level);
        let mut inner = false;
        out.heading(marker);
        out.push(format!("{indent}message {} {{", desc.name));

        let options = self.options(file, desc.options.as_ref(), out)?;
        for (key, value) in &options {
            out.heading(&mut inner);
            out.push(format!("{indent}\toption {key} = {value};"));
        }
        if !options.is_empty() {
            inner = true;
        }
        if !desc.extension.is_empty() {
            self.extensions(
                file,
                &desc.extension,
                level.saturating_add(1),
                out,
                &mut inner,
            )?;
        }
        // map entries are written as the map fields that use them
        for nested in desc.nested_type.iter().filter(|n| !n.is_map_entry()) {
            self.message(file, nested, level.saturating_add(1), out, &mut inner)?;
        }
        for nested in &desc.enum_type {
            self.enumeration(file, nested, level.saturating_add(1), out, &mut inner)?;
        }

        // proto3 optional fields are each in a oneof of their own that the compiler made
        let root: Vec<&FieldDesc> = desc
            .field
            .iter()
            .filter(|f| f.oneof_index.is_none() || f.proto3_optional)
            .collect();
        for field in &root {
            out.heading(&mut inner);
            let decl = self.declaration(file, field, true, out)?;
            out.push(format!("{indent}\t{decl}"));
        }
        if !root.is_empty() {
            inner = true;
        }

        for (i, oneof) in desc.oneof_decl.iter().enumerate() {
            let i = i32::try_from(i).unwrap_or(i32::MAX);
            let fields: Vec<&FieldDesc> = desc
                .field
                .iter()
                .filter(|f| f.oneof_index == Some(i))
                .collect();
            if fields.iter().any(|f| f.proto3_optional) {
                continue;
            }
            out.heading(&mut inner);
            out.push(format!("{indent}\toneof {} {{", oneof.name));
            for (key, value) in self.options(file, oneof.options.as_ref(), out)? {
                out.push(format!("{indent}\t\toption {key} = {value};"));
            }
            for field in fields {
                let decl = self.declaration(file, field, false, out)?;
                out.push(format!("{indent}\t\t{decl}"));
            }
            out.push(format!("{indent}\t}}"));
            inner = true;
        }

        // the ends of extension and reserved ranges in messages are exclusive
        for range in &desc.extension_range {
            out.heading(&mut inner);
            let options = self.options(file, range.options.as_ref(), out)?;
            let params = parameters(&options);
            let text = format_range(range.start, range.end.saturating_sub(1), MAX_FIELD_NUMBER);
            out.push(format!("{indent}\textensions {text}{params};"));
        }
        let ranges: Vec<String> = desc
            .reserved_range
            .iter()
            .map(|&(start, end)| format_range(start, end.saturating_sub(1), MAX_FIELD_NUMBER))
            .collect();
        reserved(&ranges, &desc.reserved_name, &indent, out, &mut inner);

        out.push(format!("{indent}}}"));
        *marker = true;
        Ok(())
    }

    fn enumeration(
        &self,
        file: usize,
        desc: &EnumDesc,
        level: usize,
        out: &mut Out,
        marker: &mut bool,
    ) -> Result<()> {
        let indent = "\t".repeat(level);
        out.heading(marker);
        out.push(format!("{indent}enum {} {{", desc.name));
        for (key, value) in self.options(file, desc.options.as_ref(), out)? {
            out.push(format!("{indent}\toption {key} = {value};"));
        }
        for value in &desc.value {
            let options = self.options(file, value.options.as_ref(), out)?;
            out.push(format!(
                "{indent}\t{} = {}{};",
                value.name,
                value.number,
                parameters(&options)
            ));
        }
        // the ends of reserved ranges in enums are inclusive
        let ranges: Vec<String> = desc
            .reserved_range
            .iter()
            .map(|&(start, end)| format_range(start, end, i32::MAX))
            .collect();
        reserved(&ranges, &desc.reserved_name, &indent, out, &mut false);
        out.push(format!("{indent}}}"));
        *marker = true;
        Ok(())
    }

    fn service(
        &self,
        file: usize,
        service: &ServiceDesc,
        out: &mut Out,
        marker: &mut bool,
    ) -> Result<()> {
        let mut inner = false;
        out.heading(marker);
        out.push(format!("service {} {{", service.name));
        let options = self.options(file, service.options.as_ref(), out)?;
        for (key, value) in &options {
            out.push(format!("\toption {key} = {value};"));
        }
        if !options.is_empty() {
            inner = true;
        }
        for method in &service.method {
            let declaration = format!(
                "\trpc {} ({}{}) returns ({}{})",
                method.name,
                if method.client_streaming {
                    "stream "
                } else {
                    ""
                },
                method.input_type.as_deref().unwrap_or_default(),
                if method.server_streaming {
                    "stream "
                } else {
                    ""
                },
                method.output_type.as_deref().unwrap_or_default(),
            );
            let options = self.options(file, method.options.as_ref(), out)?;
            out.heading(&mut inner);
            if options.is_empty() {
                out.push(format!("{declaration};"));
            } else {
                out.push(format!("{declaration} {{"));
                for (key, value) in options {
                    out.push(format!("\t\toption {key} = {value};"));
                }
                out.push("\t}".to_owned());
                inner = true;
            }
        }
        out.push("}".to_owned());
        *marker = true;
        Ok(())
    }

    fn declaration(
        &self,
        file: usize,
        field: &FieldDesc,
        emit_label: bool,
        out: &mut Out,
    ) -> Result<String> {
        let source = self.files.get(file).ok_or("file index out of range")?;
        let proto2 = non_empty(source.syntax.as_ref()).is_none_or(|s| s == "proto2");
        let mut kind = resolve_type(field);
        let mut options = OptionList::new();

        if let Some(default) = &field.default_value {
            // strings are stored as is, bytes are already escaped
            let value = match field.kind {
                TYPE_STRING => literal(default),
                TYPE_BYTES => format!("\"{default}\""),
                _ => default.clone(),
            };
            options.push(("default".to_owned(), value));
        } else if proto2
            && field.kind == TYPE_ENUM
            && field.label != LABEL_REPEATED
            && let Source::Enum(desc) = self
                .types
                .source(field.type_name.as_deref().unwrap_or_default())?
            && let Some(first) = desc.value.first()
        {
            options.push(("default".to_owned(), first.name.clone()));
        }
        if let Some(json_name) = non_empty(field.json_name.as_ref()) {
            options.push(("json_name".to_owned(), literal(json_name)));
        }
        options.extend(self.options(file, field.options.as_ref(), out)?);

        let mut label = None;
        let map_entry = if field.label == LABEL_REPEATED && field.kind == TYPE_MESSAGE {
            match self
                .types
                .source(field.type_name.as_deref().unwrap_or_default())?
            {
                Source::Message(entry) if entry.is_map_entry() => Some(entry),
                _ => None,
            }
        } else {
            None
        };
        if let Some(entry) = map_entry {
            let key = entry
                .field
                .iter()
                .find(|f| f.number == 1)
                .ok_or("map entry without a key")?;
            let value = entry
                .field
                .iter()
                .find(|f| f.number == 2)
                .ok_or("map entry without a value")?;
            kind = format!("map<{}, {}>", resolve_type(key), resolve_type(value));
        } else if emit_label && (proto2 || field.label == LABEL_REPEATED || field.proto3_optional) {
            // fields in proto3 have no label unless they are repeated or track presence
            label = Some(match field.label {
                LABEL_REQUIRED => "required",
                LABEL_REPEATED => "repeated",
                _ => "optional",
            });
        }
        let label = label.map_or_default(|l| format!("{l} "));
        Ok(format!(
            "{label}{kind} {} = {}{};",
            field.name,
            field.number,
            parameters(&options)
        ))
    }

    /// `DumpOptions`: the options `Descriptor.cs` knows, by name, then the rest.
    fn options(&self, file: usize, options: Option<&Options>, out: &mut Out) -> Result<OptionList> {
        let Some(options) = options else {
            return Ok(OptionList::new());
        };
        let mut list = known_options(options);
        self.options_matching(file, options, &mut list, out)?;
        Ok(list)
    }

    /// The options that the binary's descriptor.proto has but `Descriptor.cs` doesn't (such as
    /// the ones Valve added), then the extensions of the options message visible from the file.
    fn options_matching(
        &self,
        file: usize,
        options: &Options,
        list: &mut OptionList,
        out: &mut Out,
    ) -> Result<()> {
        let type_name = options.kind.type_name();
        let raw = options.unknown();
        let visible = |index: Option<usize>| {
            index.is_some_and(|i| {
                i == file || self.visible.get(file).is_some_and(|v| v.contains(&i))
            })
        };

        if let Some(node) = self.types.nodes.get(type_name)
            && let Some(Source::Message(desc)) = node.source
        {
            let count = list.len();
            for field in desc
                .field
                .iter()
                .filter(|f| f.name != "uninterpreted_option")
            {
                self.option_field(field, &raw, list, field.name.clone())?;
            }
            if list.len() > count
                && !visible(node.file)
                && let Some(defined_in) = node.file.and_then(|i| self.files.get(i))
            {
                out.option_imports.insert(defined_in.name.clone());
            }
        }

        for name in &self.types.order {
            let Some(node) = self.types.nodes.get(name) else {
                continue;
            };
            if let Some(Source::Field(field)) = node.source
                && visible(node.file)
                && field.extendee.as_deref() == Some(type_name)
            {
                // the full name: extensions can be declared inside a message or a package
                let key = format!("({})", name.trim_start_matches('.'));
                self.option_field(field, &raw, list, key)?;
            }
        }
        Ok(())
    }

    /// A message that is not repeated is written field by field, a repeated one is written as an
    /// aggregate value per element.
    fn option_field(
        &self,
        field: &FieldDesc,
        raw: &Raw,
        list: &mut OptionList,
        key: String,
    ) -> Result<()> {
        if field.kind == TYPE_MESSAGE && field.label != LABEL_REPEATED {
            let mut bytes = Vec::new();
            let mut present = false;
            for (number, value) in raw {
                if i32::try_from(*number).ok() == Some(field.number)
                    && let Wire::Len(part) = value
                {
                    bytes.extend_from_slice(part);
                    present = true;
                }
            }
            if !present {
                return Ok(());
            }
            let sub = read_fields(&bytes).ok_or_else(|| format!("option {key} is malformed"))?;
            let count = list.len();
            if let Source::Message(desc) = self
                .types
                .source(field.type_name.as_deref().unwrap_or_default())?
            {
                for sub_field in &desc.field {
                    self.option_field(sub_field, &sub, list, format!("{key}.{}", sub_field.name))?;
                }
            }
            if list.len() == count {
                list.push((key, "{}".to_owned()));
            }
            return Ok(());
        }
        for value in self.option_values(raw, field)? {
            list.push((key.clone(), value));
        }
        Ok(())
    }

    /// The values of a field in an options message; a field that is not repeated keeps its last.
    fn option_values(&self, raw: &Raw, field: &FieldDesc) -> Result<Vec<String>> {
        let entries: Vec<&Wire> = raw
            .iter()
            .filter(|(number, _)| i32::try_from(*number).ok() == Some(field.number))
            .map(|(_, value)| value)
            .collect();
        let mut values = match field.kind {
            TYPE_STRING => entries
                .iter()
                .filter_map(|v| match v {
                    Wire::Len(bytes) => Some(literal(&String::from_utf8_lossy(bytes))),
                    _ => None,
                })
                .collect(),
            TYPE_BYTES => entries
                .iter()
                .filter_map(|v| match v {
                    Wire::Len(bytes) => Some(bytes_literal(bytes)),
                    _ => None,
                })
                .collect(),
            TYPE_MESSAGE => {
                let Source::Message(desc) = self
                    .types
                    .source(field.type_name.as_deref().unwrap_or_default())?
                else {
                    return Err(format!("option type of {} is not a message", field.name));
                };
                let mut values = Vec::new();
                for value in &entries {
                    if let Wire::Len(bytes) = value {
                        let sub = read_fields(bytes)
                            .ok_or_else(|| format!("option {} is malformed", field.name))?;
                        values.push(self.aggregate(desc, &sub)?);
                    }
                }
                values
            }
            TYPE_ENUM => {
                let Source::Enum(desc) = self
                    .types
                    .source(field.type_name.as_deref().unwrap_or_default())?
                else {
                    return Err(format!("option type of {} is not an enum", field.name));
                };
                scalars(&entries, None)
                    .into_iter()
                    .map(|v| {
                        let number = int32(v);
                        // unknown values can only be written as their number
                        desc.value
                            .iter()
                            .find(|x| x.number == number)
                            .map_or_else(|| number.to_string(), |x| x.name.clone())
                    })
                    .collect()
            }
            kind => scalar_values(kind, &entries),
        };
        if field.label != LABEL_REPEATED && values.len() > 1 {
            values = values.pop().into_iter().collect();
        }
        Ok(values)
    }

    fn aggregate(&self, desc: &MessageDesc, raw: &Raw) -> Result<String> {
        let mut fields = Vec::new();
        for sub_field in &desc.field {
            for value in self.option_values(raw, sub_field)? {
                fields.push(if sub_field.kind == TYPE_MESSAGE {
                    format!("{} {value}", sub_field.name)
                } else {
                    format!("{}: {value}", sub_field.name)
                });
            }
        }
        Ok(if fields.is_empty() {
            "{}".to_owned()
        } else {
            format!("{{ {} }}", fields.join(" "))
        })
    }
}

fn add_extension<'a>(
    types: &mut TypeMap<'a>,
    file: usize,
    scope: &str,
    package: &str,
    ext: &'a FieldDesc,
) {
    types.add(
        package_path(scope, &ext.name),
        Some((file, Source::Field(ext))),
    );
    if is_named(ext.kind)
        && let Some(name) = non_empty(ext.type_name.as_ref())
    {
        types.add(package_path(package, name), None);
    }
    if let Some(extendee) = non_empty(ext.extendee.as_ref()) {
        types.add(package_path(package, extendee), None);
    }
}

fn add_message<'a>(types: &mut TypeMap<'a>, file: usize, package: &str, desc: &'a MessageDesc) {
    let full = package_path(package, &desc.name);
    types.add(full.clone(), Some((file, Source::Message(desc))));
    for ext in &desc.extension {
        add_extension(types, file, &full, package, ext);
    }
    for nested in &desc.enum_type {
        types.add(
            package_path(&full, &nested.name),
            Some((file, Source::Enum(nested))),
        );
    }
    for field in &desc.field {
        if is_named(field.kind)
            && let Some(name) = non_empty(field.type_name.as_ref())
        {
            types.add(package_path(package, name), None);
        }
        if let Some(extendee) = non_empty(field.extendee.as_ref()) {
            types.add(package_path(package, extendee), None);
        }
    }
    for nested in &desc.nested_type {
        add_message(types, file, &full, nested);
    }
}

/// A file sees all files it imports, and the public imports of those, recursively.
fn add_visible(
    files: &[FileDesc],
    by_name: &HashMap<&str, usize>,
    set: &mut Vec<usize>,
    file: &FileDesc,
    direct: bool,
) {
    let deps: Vec<&String> = if direct {
        file.dependency.iter().collect()
    } else {
        file.public_dependency
            .iter()
            .filter_map(|&i| file.dependency.get(usize::try_from(i).ok()?))
            .collect()
    };
    for dep in deps {
        let Some(&index) = by_name.get(dep.as_str()) else {
            continue;
        };
        let Some(dep_file) = files.get(index) else {
            continue;
        };
        if !set.contains(&index) {
            set.push(index);
        }
        add_visible(files, by_name, set, dep_file, false);
    }
}

fn known_options(options: &Options) -> OptionList {
    let mut list = OptionList::new();
    let flag = |list: &mut OptionList, name: &str, number: u32| {
        if let Some(value) = options.flag(number) {
            list.push((name.to_owned(), value.to_string()));
        }
    };
    let string = |list: &mut OptionList, name: &str, number: u32| {
        if let Some(Wire::Len(bytes)) = options.last(number) {
            list.push((name.to_owned(), literal(&String::from_utf8_lossy(bytes))));
        }
    };
    let enumeration = |list: &mut OptionList, name: &str, number: u32, names: &[&str]| {
        if let Some(Wire::Varint(value)) = options.last(number) {
            let value = int32(*value);
            let text = usize::try_from(value)
                .ok()
                .and_then(|i| names.get(i))
                .map_or_else(|| value.to_string(), |n| (*n).to_owned());
            list.push((name.to_owned(), text));
        }
    };
    match options.kind {
        OptionsKind::File => {
            flag(&mut list, "deprecated", 23);
            enumeration(
                &mut list,
                "optimize_for",
                9,
                &["0", "SPEED", "CODE_SIZE", "LITE_RUNTIME"],
            );
            flag(&mut list, "cc_generic_services", 16);
            flag(&mut list, "cc_enable_arenas", 31);
            string(&mut list, "go_package", 11);
            string(&mut list, "java_package", 1);
            string(&mut list, "java_outer_classname", 8);
            flag(&mut list, "java_generate_equals_and_hash", 20);
            flag(&mut list, "java_generic_services", 17);
            flag(&mut list, "java_multiple_files", 10);
            flag(&mut list, "java_string_check_utf8", 27);
            flag(&mut list, "py_generic_services", 18);
            string(&mut list, "ruby_package", 45);
            string(&mut list, "objc_class_prefix", 36);
            string(&mut list, "csharp_namespace", 37);
            string(&mut list, "swift_prefix", 39);
            flag(&mut list, "php_generic_services", 42);
            string(&mut list, "php_class_prefix", 40);
            string(&mut list, "php_namespace", 41);
            string(&mut list, "php_metadata_namespace", 44);
        }
        OptionsKind::Field => {
            enumeration(&mut list, "ctype", 1, &["STRING", "CORD", "STRING_PIECE"]);
            flag(&mut list, "deprecated", 3);
            flag(&mut list, "lazy", 5);
            flag(&mut list, "packed", 2);
            flag(&mut list, "weak", 10);
            enumeration(
                &mut list,
                "jstype",
                6,
                &["JS_NORMAL", "JS_STRING", "JS_NUMBER"],
            );
        }
        OptionsKind::Message => {
            flag(&mut list, "message_set_wire_format", 1);
            flag(&mut list, "no_standard_descriptor_accessor", 2);
            flag(&mut list, "deprecated", 3);
        }
        OptionsKind::Enum => {
            flag(&mut list, "allow_alias", 2);
            flag(&mut list, "deprecated", 3);
        }
        OptionsKind::EnumValue => flag(&mut list, "deprecated", 1),
        OptionsKind::Service => flag(&mut list, "deprecated", 33),
        OptionsKind::Method => {
            flag(&mut list, "deprecated", 33);
            enumeration(
                &mut list,
                "idempotency_level",
                34,
                &["IDEMPOTENCY_UNKNOWN", "NO_SIDE_EFFECTS", "IDEMPOTENT"],
            );
        }
        OptionsKind::Oneof | OptionsKind::ExtensionRange => {}
    }
    list
}

/// Varint (or fixed, with `width`) values of a scalar field, packed ones expanded.
fn scalars(entries: &[&Wire], width: Option<usize>) -> Vec<u64> {
    let mut values = Vec::new();
    for value in entries {
        match value {
            Wire::Varint(v) | Wire::Fixed64(v) => values.push(*v),
            Wire::Fixed32(v) => values.push(u64::from(*v)),
            Wire::Len(bytes) => match width {
                Some(4) => values.extend(
                    bytes
                        .as_chunks::<4>()
                        .0
                        .iter()
                        .map(|c| u64::from(u32::from_le_bytes(*c))),
                ),
                Some(_) => values.extend(
                    bytes
                        .as_chunks::<8>()
                        .0
                        .iter()
                        .map(|c| u64::from_le_bytes(*c)),
                ),
                None => {
                    let mut pos = 0;
                    while let Some(v) = read_varint(bytes, &mut pos) {
                        values.push(v);
                    }
                }
            },
        }
    }
    values
}

fn scalar_values(kind: i32, entries: &[&Wire]) -> Vec<String> {
    let width = match kind {
        TYPE_FIXED32 | TYPE_SFIXED32 | TYPE_FLOAT => Some(4),
        TYPE_FIXED64 | TYPE_SFIXED64 | TYPE_DOUBLE => Some(8),
        _ => None,
    };
    let low32 = |v: u64| u32::try_from(v & 0xffff_ffff).unwrap_or_default();
    scalars(entries, width)
        .into_iter()
        .filter_map(|v| {
            Some(match kind {
                TYPE_INT32 | TYPE_SFIXED32 => int32(v).to_string(),
                TYPE_UINT32 | TYPE_FIXED32 => low32(v).to_string(),
                TYPE_SINT32 => {
                    let v = low32(v);
                    ((v >> 1).cast_signed() ^ (v & 1).cast_signed().wrapping_neg()).to_string()
                }
                TYPE_INT64 | TYPE_SFIXED64 => v.cast_signed().to_string(),
                TYPE_UINT64 | TYPE_FIXED64 => v.to_string(),
                TYPE_SINT64 => {
                    ((v >> 1).cast_signed() ^ (v & 1).cast_signed().wrapping_neg()).to_string()
                }
                TYPE_BOOL => (v != 0).to_string(),
                TYPE_FLOAT => float_literal(f64::from(f32::from_bits(low32(v))), true),
                TYPE_DOUBLE => float_literal(f64::from_bits(v), false),
                _ => return None,
            })
        })
        .collect()
}

/// `.NET`'s shortest round-trip float formatting (`1E+20`, `1.5E-07`). No option in Valve's protos
/// is a float so far, so this is untested against the real dumper.
fn float_literal(value: f64, single: bool) -> String {
    if value.is_nan() {
        return "nan".to_owned();
    }
    if value.is_infinite() {
        return if value > 0.0 { "inf" } else { "-inf" }.to_owned();
    }
    let magnitude = value.abs();
    let threshold = if single { 1e7 } else { 1e15 };
    if magnitude != 0.0 && !(1e-5..threshold).contains(&magnitude) {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "a float option is stored as f32"
        )]
        let text = if single {
            format!("{:e}", value as f32)
        } else {
            format!("{value:e}")
        };
        let (mantissa, exponent) = text.split_once('e').unwrap_or((&text, "0"));
        let (sign, digits) = exponent
            .strip_prefix('-')
            .map_or(("+", exponent), |d| ("-", d));
        return format!("{mantissa}E{sign}{digits:0>2}");
    }
    #[expect(
        clippy::cast_possible_truncation,
        reason = "a float option is stored as f32"
    )]
    let text = if single {
        (value as f32).to_string()
    } else {
        value.to_string()
    };
    text
}

fn resolve_type(field: &FieldDesc) -> String {
    if is_named(field.kind) {
        return field.type_name.clone().unwrap_or_default();
    }
    match field.kind {
        TYPE_INT32 => "int32",
        TYPE_INT64 => "int64",
        TYPE_SINT32 => "sint32",
        TYPE_SINT64 => "sint64",
        TYPE_UINT32 => "uint32",
        TYPE_UINT64 => "uint64",
        TYPE_STRING => "string",
        TYPE_BOOL => "bool",
        TYPE_BYTES => "bytes",
        TYPE_DOUBLE => "double",
        TYPE_FLOAT => "float",
        TYPE_GROUP => "GROUP",
        TYPE_FIXED32 => "fixed32",
        TYPE_FIXED64 => "fixed64",
        TYPE_SFIXED32 => "sfixed32",
        TYPE_SFIXED64 => "sfixed64",
        other => return other.to_string(),
    }
    .to_owned()
}

fn parameters(options: &OptionList) -> String {
    if options.is_empty() {
        return String::new();
    }
    let joined: Vec<String> = options.iter().map(|(k, v)| format!("{k} = {v}")).collect();
    format!(" [{}]", joined.join(", "))
}

fn format_range(start: i32, end: i32, max: i32) -> String {
    if start == end {
        start.to_string()
    } else if end >= max {
        format!("{start} to max")
    } else {
        format!("{start} to {end}")
    }
}

fn reserved(ranges: &[String], names: &[String], indent: &str, out: &mut Out, marker: &mut bool) {
    if !ranges.is_empty() {
        out.heading(marker);
        out.push(format!("{indent}\treserved {};", ranges.join(", ")));
    }
    if !names.is_empty() {
        out.heading(marker);
        let names: Vec<String> = names.iter().map(|n| literal(n)).collect();
        out.push(format!("{indent}\treserved {};", names.join(", ")));
    }
}

fn octal(text: &mut String, value: u32) {
    // writing to a String cannot fail
    write!(text, "\\{value:03o}").unwrap_or_default();
}

/// A string literal, escaped as C# `Util.ToLiteral` does.
fn literal(value: &str) -> String {
    let mut text = String::with_capacity(value.len().saturating_add(2));
    text.push('"');
    for c in value.chars() {
        match c {
            '\u{7}' => text.push_str("\\a"),
            '\u{8}' => text.push_str("\\b"),
            '\u{c}' => text.push_str("\\f"),
            '\n' => text.push_str("\\n"),
            '\r' => text.push_str("\\r"),
            '\t' => text.push_str("\\t"),
            '\u{b}' => text.push_str("\\v"),
            '\\' => text.push_str("\\\\"),
            '"' => text.push_str("\\\""),
            c if u32::from(c) < 0x20 || c == '\u{7f}' => octal(&mut text, u32::from(c)),
            c => text.push(c),
        }
    }
    text.push('"');
    text
}

fn bytes_literal(value: &[u8]) -> String {
    let mut text = String::with_capacity(value.len().saturating_add(2));
    text.push('"');
    for &b in value {
        if b == b'\\' || b == b'"' {
            text.push('\\');
            text.push(char::from(b));
        } else if !(0x20..0x7f).contains(&b) {
            octal(&mut text, u32::from(b));
        } else {
            text.push(char::from(b));
        }
    }
    text.push('"');
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literals_escape_like_csharp() {
        assert_eq!(literal("a\"b\\c\n\u{1}"), r#""a\"b\\c\n\001""#);
        assert_eq!(bytes_literal(&[0x41, 0xff, b'"']), r#""A\377\"""#);
    }

    #[test]
    fn ranges() {
        assert_eq!(format_range(5, 5, MAX_FIELD_NUMBER), "5");
        assert_eq!(
            format_range(5, MAX_FIELD_NUMBER, MAX_FIELD_NUMBER),
            "5 to max"
        );
        assert_eq!(format_range(5, 9, MAX_FIELD_NUMBER), "5 to 9");
    }

    #[test]
    fn package_paths() {
        assert_eq!(package_path("", "Foo"), ".Foo");
        assert_eq!(package_path("pkg", "Foo"), ".pkg.Foo");
        assert_eq!(package_path(".pkg.Msg", "Foo"), ".pkg.Msg.Foo");
        assert_eq!(package_path("pkg", ".Other"), ".Other");
    }

    #[test]
    fn floats() {
        assert_eq!(float_literal(0.5, false), "0.5");
        assert_eq!(float_literal(1e20, false), "1E+20");
    }
}
