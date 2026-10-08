use std::{fs, io, path::PathBuf};

use prost_build::Config;
use prost_types::FileDescriptorSet;

fn required_protos() -> Vec<&'static str> {
    let mut protos = vec![];
    #[cfg(feature = "gc-client")]
    protos.extend(&["citadel_gcmessages_client.proto"]);
    #[cfg(feature = "game-msgs")]
    protos.extend(&["citadel_gcmessages_client.proto"]);
    #[cfg(feature = "user-msgs")]
    protos.extend(&[
        "usercmd.proto",
        "citadel_usercmd.proto",
        "citadel_gameevents.proto",
        "citadel_usermessages.proto",
        "citadel_gcmessages_client.proto",
        "demo.proto",
        "netmessages.proto",
        "usermessages.proto",
        "gameevents.proto",
        "networkbasetypes.proto",
        "network_connection.proto",
    ]);
    #[cfg(feature = "gc-common")]
    protos.extend(&[
        "citadel_gcmessages_common.proto",
        "base_gcmessages.proto",
        "gcsdk_gcmessages.proto",
        "steammessages.proto",
        "steammessages_steamlearn.steamworkssdk.proto",
        "steammessages_unified_base.steamworkssdk.proto",
        "valveextensions.proto",
    ]);
    protos
}

fn collect_protos(dir: &str) -> io::Result<Vec<PathBuf>> {
    let protos = required_protos();
    let mut paths = vec![];
    for dir_entry in fs::read_dir(dir)? {
        let path = dir_entry?.path();
        assert!(path.is_file());
        assert!(path.extension().is_some_and(|ext| ext == "proto"));
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| protos.contains(&name))
        {
            paths.push(path);
        }
    }
    Ok(paths)
}

/// a prost config that writes messages without a package into `{package}.rs`.
fn new_config(package: &str) -> Config {
    let mut config = Config::default();
    config.default_package_filename(package);
    #[cfg(feature = "serde")]
    {
        config.type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");
    }
    config
}

type ExternDefs<'a> = (&'a Option<FileDescriptorSet>, &'static str);

/// declares all enums and messages from ExternDefs' [`FileDescriptorSet`] as external. more info
/// is available in documentation of [`prost_build::config::Config::extern_path`].
fn decl_externs(externs: &[ExternDefs], config: &mut Config) {
    use std::collections::HashSet;

    // NOTE: prost runs heck's upper camel case transformer on all idents. valve-defined names such
    // as EGCPlatform will be transformed into EgcPlatform, etc.
    // see https://github.com/tokio-rs/prost/blob/9ed944eb633480079037dfceeee61aac6cd0c94f/prost-build/src/ident.rs#L30
    use heck::ToUpperCamelCase;

    let mut declared: HashSet<&str> = HashSet::new();
    for (fds, rust_path) in externs {
        let Some(fds) = fds else {
            continue;
        };
        for file in &fds.file {
            file.enum_type
                .iter()
                .map(|enum_type| enum_type.name())
                .chain(
                    file.message_type
                        .iter()
                        .map(|message_type| message_type.name()),
                )
                .for_each(|name| {
                    if declared.insert(name) {
                        config.extern_path(
                            format!(".{name}"),
                            format!("{}::{}", rust_path, name.to_upper_camel_case()),
                        );
                    }
                });
        }
    }
}

/// compiles the required protos of `protos/{package}` into `{package}.rs`; returns their
/// descriptors, or `None` if none of them are required.
fn load_protos(package: &str) -> io::Result<Option<FileDescriptorSet>> {
    let mut config = new_config(package);

    let dir = format!("protos/{package}");
    let protos = collect_protos(&dir)?;
    if protos.is_empty() {
        return Ok(None);
    }
    let fds = config.load_fds(&protos, &[&dir])?;
    config.compile_fds(fds.clone())?;
    Ok(Some(fds))
}

fn compile_deadlock_protos(externs: &[ExternDefs]) -> io::Result<()> {
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());

    #[allow(unused)]
    let descriptor_file = out.join("descriptors.bin");

    let mut config = new_config("deadlock");

    // reflect (prost-reflect) needs the descriptor set on disk.
    #[cfg(feature = "reflect")]
    {
        config.file_descriptor_set_path(&descriptor_file);
    }

    decl_externs(externs, &mut config);

    let protos = collect_protos("protos/deadlock")?;
    let includes: &[&str] = &["protos/deadlock", "protos/gcsdk", "protos/common"];

    #[cfg(feature = "reflect")]
    {
        prost_reflect_build::Builder::new()
            .file_descriptor_set_path(&descriptor_file)
            .descriptor_pool("crate::deadlock::DESCRIPTOR_POOL")
            .configure(&mut config, &protos, includes)?;
    }

    config.compile_protos(&protos, includes)?;

    // expose the descriptor set path to dependent crates' build scripts (via the `links` key)
    // as DEP_VALVEPROTOS_DESCRIPTORS.
    #[cfg(feature = "reflect")]
    {
        println!("cargo::metadata=descriptors={}", descriptor_file.display());
    }

    Ok(())
}

fn main() -> io::Result<()> {
    // tell cargo that if the given file changes, to rerun this build script.
    println!("cargo::rerun-if-changed=protos");

    let common_fds = load_protos("common")?;
    let gcsdk_fds = load_protos("gcsdk")?;

    compile_deadlock_protos(&[(&common_fds, "crate::common"), (&gcsdk_fds, "crate::gcsdk")])?;

    Ok(())
}
