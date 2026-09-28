#[cfg(feature = "user-msgs")]
pub mod common {
    include!(concat!(env!("OUT_DIR"), "/common.rs"));
}

#[cfg(any(feature = "gc-common", feature = "user-msgs", feature = "gc-client"))]
pub mod gcsdk {
    include!(concat!(env!("OUT_DIR"), "/gcsdk.rs"));
}

pub mod deadlock {
    include!(concat!(env!("OUT_DIR"), "/deadlock.rs"));

    #[cfg(feature = "reflect")]
    pub static DESCRIPTOR_POOL: std::sync::LazyLock<prost_reflect::DescriptorPool> =
        std::sync::LazyLock::new(|| {
            prost_reflect::DescriptorPool::decode(
                include_bytes!(concat!(env!("OUT_DIR"), "/descriptors.bin")).as_ref(),
            )
            .expect("failed to decode descriptor pool")
        });
}
