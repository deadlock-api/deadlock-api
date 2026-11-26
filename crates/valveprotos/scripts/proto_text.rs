//! Fixes applied to every proto before it is written to `protos/`, shared by `fetch-protos`
//! (protos from `SteamDatabase/Protobufs`) and `extract-protos` (protos from the local game
//! binaries).

use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// The local proto dirs. Each holds the protos of `SteamDatabase/Protobufs`' `deadlock` dir that the crate
/// builds: the shared Source 2 engine protos (common, gcsdk) come from Deadlock's own dump too,
/// as Dota 2's copies lag behind Deadlock's engine branch and would drop fields haste relies on
/// (e.g. `ProtoCoordSizeParams_t`, `quantized_float_encoder_aliases`, `max_coord`).
pub(crate) const PROTO_DIRS: &[&str] = &["common", "gcsdk", "deadlock"];

/// The `.proto` files in `protos/{dir}`, sorted.
pub(crate) fn local_protos(dir: &str) -> io::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(Path::new("protos").join(dir))? {
        let path = entry?.path();
        if !path.is_file() || path.extension().is_none_or(|ext| ext != "proto") {
            return Err(io::Error::other(format!(
                "{} is not a .proto file",
                path.display()
            )));
        }
        paths.push(path);
    }
    paths.sort();
    Ok(paths)
}

/// Adds the syntax declaration that the dumps leave out (protoc warns without it) and strips the
/// codegen options protoc doesn't know.
pub(crate) fn clean(body: &str) -> String {
    if body.contains("syntax = \"proto2\"") || body.contains("syntax = \"proto3\"") {
        strip_codegen_options(body)
    } else {
        strip_codegen_options(&format!("syntax = \"proto2\";\n\n{body}"))
    }
}

/// Appends `patch.proto` to `citadel_gcmessages_common.proto`.
pub(crate) fn append_patch() -> io::Result<()> {
    let patch = fs::read_to_string("patch.proto")?;
    let common_path = "protos/deadlock/citadel_gcmessages_common.proto";
    let mut common = fs::read_to_string(common_path)?;
    common.push_str(&patch);
    fs::write(common_path, common)
}

/// Options from Valve's C++ codegen that the dumps use but never declare, so protoc rejects them.
const UNDECLARED_FIELD_OPTIONS: &[&str] = &["boxed_type", "synthetic_default"];
const UNDECLARED_FILE_OPTIONS: &[&str] = &["additional_includes"];

/// Removes the undeclared options: whole `option x = ...;` lines and `x = ...` entries in field
/// option lists, dropping a list that ends up empty.
fn strip_codegen_options(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    for line in body.lines() {
        let trimmed = line.trim_start();
        if UNDECLARED_FILE_OPTIONS
            .iter()
            .any(|opt| trimmed.starts_with(&format!("option {opt} ")))
        {
            continue;
        }
        out.push_str(&strip_field_options(line));
        out.push('\n');
    }
    out
}

fn strip_field_options(line: &str) -> String {
    let (Some(open), Some(close)) = (line.find(" ["), line.rfind("];")) else {
        return line.to_owned();
    };
    // `None` when the list closes before it opens
    let (Some(head), Some(list), Some(rest)) = (
        line.get(..open),
        line.get(open..close)
            .and_then(|list| list.strip_prefix(" [")),
        line.get(close..).and_then(|rest| rest.strip_prefix(']')),
    ) else {
        return line.to_owned();
    };

    // split the option list on commas outside of string literals
    let mut in_str = false;
    let kept: Vec<_> = list
        .split(|c| {
            if c == '"' {
                in_str = !in_str;
            }
            c == ',' && !in_str
        })
        .map(str::trim)
        .filter(|entry| {
            !UNDECLARED_FIELD_OPTIONS.iter().any(|opt| {
                entry
                    .strip_prefix(opt)
                    .is_some_and(|rest| rest.trim_start().starts_with('='))
            })
        })
        .collect();
    if kept.is_empty() {
        format!("{head}{rest}")
    } else {
        format!("{head} [{}]{rest}", kept.join(", "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_codegen_options() {
        let body = "option additional_includes = \"a.h\";\nmessage M {\n\toptional uint32 a = 1 [boxed_type = \"T\"];\n\toptional uint32 b = 2 [default = 0, boxed_type = \"T\", synthetic_default = \"0\"];\n}\n";
        assert_eq!(
            clean(body),
            "syntax = \"proto2\";\n\nmessage M {\n\toptional uint32 a = 1;\n\toptional uint32 b = 2 [default = 0];\n}\n"
        );
    }
}
