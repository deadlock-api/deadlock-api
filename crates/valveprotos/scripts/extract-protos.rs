//! Extracts the protos embedded in the game binaries of a local Deadlock install into `protos/`.
//!
//! These are the files of `SteamDatabase/Protobufs`, which `fetch-protos` downloads: they are
//! dumped from the same binaries with `SteamRE`'s `ProtobufDumper`, which `proto_dump` and
//! `proto_print` port, so the output is the same byte for byte. This one works as soon as Steam
//! has updated the game, before the dump in that repo is out. Run it from the crate root:
//!
//! ```sh
//! cargo run -p valveprotos --bin extract-protos -- [<deadlock install dir>] [--raw <dir>]
//! ```
//!
//! Without a dir it reads Steam's default library. `--raw <dir>` also writes every dumped file as
//! is, for diffing against `SteamDatabase/Protobufs`.
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
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Component, Path, PathBuf},
};

#[path = "proto_dump.rs"]
mod proto_dump;
#[path = "proto_print.rs"]
mod proto_print;
#[path = "proto_text.rs"]
mod proto_text;

/// Scanned in this order, the first copy of a file wins. `server.dll` goes first, as in
/// `SteamDatabase/Protobufs`: the `usermessages.proto` of `client.dll` has extra default options.
const BINARIES: &[&str] = &[
    "game/citadel/bin/win64/server.dll",
    "game/citadel/bin/win64/client.dll",
];

const DEFAULT_INSTALLS: &[&str] = &[
    ".local/share/Steam/steamapps/common/Deadlock",
    "C:/Program Files (x86)/Steam/steamapps/common/Deadlock",
];

#[derive(Debug)]
struct Args {
    game_dir: PathBuf,
    raw_dir: Option<PathBuf>,
}

fn parse_args() -> Result<Args, String> {
    let mut game_dir = None;
    let mut raw_dir = None;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--raw" {
            raw_dir = Some(PathBuf::from(args.next().ok_or("--raw needs a directory")?));
        } else if arg.starts_with('-') {
            return Err(format!(
                "unknown flag {arg}; usage: extract-protos [<deadlock dir>] [--raw <dir>]"
            ));
        } else {
            game_dir = Some(PathBuf::from(arg));
        }
    }
    let game_dir = if let Some(dir) = game_dir {
        dir
    } else {
        let home = env::var_os("HOME").map_or_default(PathBuf::from);
        DEFAULT_INSTALLS
            .iter()
            .map(|dir| home.join(dir))
            .find(|dir| {
                dir.join(BINARIES.first().copied().unwrap_or_default())
                    .is_file()
            })
            .ok_or("no Deadlock install found in Steam's default library; pass its directory")?
    };
    Ok(Args { game_dir, raw_dir })
}

/// `ClientVersion` from steam.inf, for the summary.
fn client_version(game_dir: &Path) -> Option<String> {
    let inf = fs::read_to_string(game_dir.join("game/citadel/steam.inf")).ok()?;
    inf.lines()
        .find_map(|line| line.strip_prefix("ClientVersion="))
        .map(|v| v.trim().to_owned())
}

/// A file name from a binary as a path under `dir`; `None` if it would leave `dir`.
fn safe_join(dir: &Path, name: &str) -> Option<PathBuf> {
    let relative = Path::new(name);
    relative
        .components()
        .all(|c| matches!(c, Component::Normal(_)))
        .then(|| dir.join(relative))
}

#[expect(
    clippy::print_stderr,
    reason = "a CLI script that reports its progress on stderr"
)]
fn main() -> Result<(), Box<dyn core::error::Error>> {
    let args = parse_args()?;

    let mut files = Vec::new();
    for binary in BINARIES {
        let path = args.game_dir.join(binary);
        let data = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let before = files.len();
        proto_dump::scan(&data, &mut files);
        eprintln!(
            "{}: {} protos",
            path.display(),
            files.len().saturating_sub(before)
        );
    }
    let dumped: HashMap<String, String> = proto_print::Dumper::new(&files)?
        .dump_all()?
        .into_iter()
        .collect();

    if let Some(raw_dir) = &args.raw_dir {
        for (name, text) in &dumped {
            let path =
                safe_join(raw_dir, name).ok_or_else(|| format!("unsafe proto name {name}"))?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, text)?;
        }
        eprintln!("wrote {} raw protos to {}", dumped.len(), raw_dir.display());
    }

    let mut previous = Vec::new();
    for dir in proto_text::PROTO_DIRS {
        for path in proto_text::local_protos(dir)? {
            let name = path
                .file_name()
                .map_or_default(|n| n.to_string_lossy().into_owned());
            let text = dumped
                .get(&name)
                .ok_or_else(|| format!("{name} is not in the game binaries"))?;
            previous.push((path.clone(), fs::read_to_string(&path)?));
            fs::write(&path, proto_text::clean(text))?;
        }
    }
    proto_text::append_patch()?;

    let mut changed = HashSet::new();
    for (path, before) in &previous {
        if fs::read_to_string(path)? != *before {
            changed.insert(path.display().to_string());
        }
    }
    let mut changed: Vec<String> = changed.into_iter().collect();
    changed.sort();
    eprintln!(
        "build {}: wrote {} protos, {} changed",
        client_version(&args.game_dir).as_deref().unwrap_or("?"),
        previous.len(),
        changed.len(),
    );
    for path in changed {
        eprintln!("  {path}");
    }
    Ok(())
}
