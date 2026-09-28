//! this script builds dot graph of imports. can be visualized either with by piping the output
//! into `dot | dot -Tpng | feh -` or pasting into <https://dreampuf.github.io/GraphvizOnline>, or
//! some! other way?
//!
//! this is not a part of "cargo" project (yet). to run this you'll need pre-rfc rust-script thing
//! <https://rust-script.org/>.
use std::{fs, io, path::Path};

const PROTO_DIRS: &[&str] = &["common", "gcsdk", "deadlock"];

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
            assert!(file_path.is_file());
            assert!(file_path.extension().is_some_and(|ext| ext == "proto"));

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
                    .to_string();

                println!("    \"{file_name}\" -> \"{import}\";");
            }
        }

        println!("  }}");
    }

    println!("}}");

    Ok(())
}
