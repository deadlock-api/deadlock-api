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
const PROTO_DIR_PAIRS: &[(&str, &str)] = &[
    ("common", "dota2"),
    ("gcsdk", "dota2"),
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
            eprintln!("fetching {} -> {}", &url, file_path.display());
            let body = ureq::get(&url).call()?.into_body().read_to_string()?;

            // Ensure syntax declaration is present (protoc warns without it)
            let body = if !body.contains("syntax = \"proto2\"")
                && !body.contains("syntax = \"proto3\"")
            {
                format!("syntax = \"proto2\";\n\n{body}")
            } else {
                body
            };

            fs::write(file_path, body)?;
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
