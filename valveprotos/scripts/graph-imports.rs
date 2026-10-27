//! this script builds dot graph of imports. can be visualized either with by piping the output
//! into `dot | dot -Tpng | feh -` or pasting into <https://dreampuf.github.io/GraphvizOnline>, or
//! some! other way?
//!
//! this is not a part of "cargo" project (yet). to run this you'll need pre-rfc rust-script thing
//! <https://rust-script.org/>.
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
use std::{fs, io, path::Path};

const PROTO_DIRS: &[&str] = &["common", "gcsdk", "deadlock"];

#[expect(
    clippy::print_stdout,
    reason = "a CLI script whose output is the graph"
)]
fn main() -> io::Result<()> {
    println!("digraph ImportGraph {{");
    println!("  ranksep = 2;");

    // NOTE: order is important
    for proto_dir in PROTO_DIRS {
        println!("  subgraph cluster_{proto_dir} {{");
        println!("    label = \"{proto_dir}\";");
        println!("    penwidth = 1;");

        for file_entry in fs::read_dir(Path::new("protos").join(proto_dir))? {
            let file_path = file_entry?.path();
            if !file_path.is_file() || file_path.extension().is_none_or(|ext| ext != "proto") {
                return Err(io::Error::other(format!(
                    "{} is not a .proto file",
                    file_path.display()
                )));
            }

            let file_name = file_path
                .file_name()
                .unwrap_or(file_path.as_os_str())
                .to_string_lossy();

            for line in fs::read_to_string(&file_path)?.lines() {
                if !line.starts_with("import") {
                    continue;
                }

                let import = line
                    .trim_start_matches("import \"")
                    .trim_end_matches("\";")
                    .to_owned();

                println!("    \"{file_name}\" -> \"{import}\";");
            }
        }

        println!("  }}");
    }

    println!("}}");

    Ok(())
}
