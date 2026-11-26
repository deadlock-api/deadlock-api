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
use std::fs;

#[path = "proto_text.rs"]
mod proto_text;

#[expect(
    clippy::print_stderr,
    reason = "a CLI script that reports its progress on stderr"
)]
fn main() -> Result<(), Box<dyn core::error::Error>> {
    for local_dir in proto_text::PROTO_DIRS {
        for file_path in proto_text::local_protos(local_dir)? {
            let file_name = file_path
                .file_name()
                .unwrap_or(file_path.as_os_str())
                .to_string_lossy();

            let url = format!(
                "https://raw.githubusercontent.com/SteamDatabase/Protobufs/refs/heads/master/deadlock/{file_name}"
            );
            eprintln!("fetching {url} -> {}", file_path.display());
            let body = ureq::get(&url).call()?.into_body().read_to_string()?;

            fs::write(file_path, proto_text::clean(&body))?;
        }
    }

    proto_text::append_patch()?;

    eprintln!("done");

    Ok(())
}
