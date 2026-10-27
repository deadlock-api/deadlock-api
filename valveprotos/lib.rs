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

#[cfg(feature = "user-msgs")]
pub mod common {
    #![allow(
        clippy::all,
        clippy::pedantic,
        clippy::nursery,
        clippy::empty_structs_with_brackets,
        clippy::same_name_method,
        reason = "prost-generated code"
    )]

    include!(concat!(env!("OUT_DIR"), "/common.rs"));
}

#[cfg(any(feature = "gc-common", feature = "user-msgs", feature = "gc-client"))]
pub mod gcsdk {
    #![allow(
        clippy::all,
        clippy::pedantic,
        clippy::nursery,
        clippy::empty_structs_with_brackets,
        clippy::same_name_method,
        reason = "prost-generated code"
    )]

    include!(concat!(env!("OUT_DIR"), "/gcsdk.rs"));
}

pub mod deadlock {
    #![allow(
        clippy::all,
        clippy::pedantic,
        clippy::nursery,
        clippy::empty_structs_with_brackets,
        clippy::same_name_method,
        reason = "prost-generated code"
    )]

    include!(concat!(env!("OUT_DIR"), "/deadlock.rs"));

    #[cfg(feature = "reflect")]
    pub static DESCRIPTOR_POOL: std::sync::LazyLock<prost_reflect::DescriptorPool> =
        std::sync::LazyLock::new(|| {
            prost_reflect::DescriptorPool::decode(
                include_bytes!(concat!(env!("OUT_DIR"), "/descriptors.bin")).as_ref(),
            )
            // build.rs writes descriptors.bin from the same protos; the test below checks it decodes.
            .unwrap_or_default()
        });

    #[cfg(all(test, feature = "reflect"))]
    mod tests {
        #[test]
        fn descriptor_pool_decodes() {
            assert!(super::DESCRIPTOR_POOL.all_messages().next().is_some());
        }
    }
}
