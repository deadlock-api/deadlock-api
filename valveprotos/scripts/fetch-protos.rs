//! this script fetches latest protos from steamdb's <https://github.com/SteamDatabase/Protobufs>
//! repo.
//!
//! this is not a part of "cargo" project (yet). to run this you'll need pre-rfc rust-script thing
//! <https://rust-script.org/>.
//!
//! ```cargo
//! [dependencies]
//! ureq = "2.10.1"
//! ```
use std::{fs, path::Path};

// (local dir, remote dir)
//
// The shared Source 2 engine protos (common, gcsdk) come from Deadlock's own dump too: Dota 2's
// copies lag behind Deadlock's engine branch and would drop fields haste relies on (e.g.
// `ProtoCoordSizeParams_t`, `quantized_float_encoder_aliases`, `max_coord`).
const PROTO_DIR_PAIRS: &[(&str, &str)] = &[
    ("common", "deadlock"),
    ("gcsdk", "deadlock"),
    ("deadlock", "deadlock"),
];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    for (local_dir, remote_dir) in PROTO_DIR_PAIRS {
        for file_entry in fs::read_dir(Path::new("protos").join(local_dir))? {
            let file_path = file_entry?.path();
            assert!(file_path.is_file());
            assert!(file_path.extension().is_some_and(|ext| ext == "proto"));

            let file_name = file_path
                .file_name()
                .unwrap_or(file_path.as_os_str())
                .to_string_lossy();

            let url = format!(
                "https://raw.githubusercontent.com/SteamDatabase/Protobufs/refs/heads/master/{remote_dir}/{file_name}"
            );
            eprintln!("fetching {url} -> {}", file_path.display());
            let body = ureq::get(&url).call()?.into_body().read_to_string()?;

            // Ensure syntax declaration is present (protoc warns without it)
            let body =
                if !body.contains("syntax = \"proto2\"") && !body.contains("syntax = \"proto3\"") {
                    format!("syntax = \"proto2\";\n\n{body}")
                } else {
                    body
                };

            fs::write(file_path, strip_codegen_options(&body))?;
        }
    }

    // Add contents of patch.proto to citadel_gcmessages_common.proto
    let patch = fs::read_to_string("patch.proto")?;
    let common = fs::read_to_string("protos/deadlock/citadel_gcmessages_common.proto")?;
    fs::write(
        "protos/deadlock/citadel_gcmessages_common.proto",
        common + &patch,
    )?;

    eprintln!("done");

    Ok(())
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
        return line.to_string();
    };
    if close < open {
        return line.to_string();
    }

    // split the option list on commas outside of string literals
    let list = &line[open + 2..close];
    let mut entries = vec![];
    let (mut start, mut in_str) = (0, false);
    for (i, c) in list.char_indices() {
        match c {
            '"' => in_str = !in_str,
            ',' if !in_str => {
                entries.push(list[start..i].trim());
                start = i + 1;
            }
            _ => {}
        }
    }
    entries.push(list[start..].trim());

    let kept: Vec<_> = entries
        .into_iter()
        .filter(|entry| {
            !UNDECLARED_FIELD_OPTIONS.iter().any(|opt| {
                entry
                    .strip_prefix(opt)
                    .is_some_and(|rest| rest.trim_start().starts_with('='))
            })
        })
        .collect();
    let rest = &line[close + 1..];
    if kept.is_empty() {
        format!("{}{rest}", &line[..open])
    } else {
        format!("{} [{}]{rest}", &line[..open], kept.join(", "))
    }
}
