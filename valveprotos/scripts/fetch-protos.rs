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
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]
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

#[expect(
    clippy::print_stderr,
    reason = "a CLI script that reports its progress on stderr"
)]
fn main() -> Result<(), Box<dyn core::error::Error>> {
    for (local_dir, remote_dir) in PROTO_DIR_PAIRS {
        for file_entry in fs::read_dir(Path::new("protos").join(local_dir))? {
            let file_path = file_entry?.path();
            if !file_path.is_file() || file_path.extension().is_none_or(|ext| ext != "proto") {
                return Err(format!("{} is not a .proto file", file_path.display()).into());
            }

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
    let mut common = fs::read_to_string("protos/deadlock/citadel_gcmessages_common.proto")?;
    common.push_str(&patch);
    fs::write("protos/deadlock/citadel_gcmessages_common.proto", common)?;

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
