#![deny(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![allow(clippy::unreadable_literal)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_wrap)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::match_wildcard_for_single_variants)]

// TODO: figure pub scopes for all the things
#[cfg(feature = "async")]
pub mod async_broadcast_stream;
#[cfg(feature = "async")]
pub mod async_demofile;
#[cfg(feature = "async")]
pub mod async_demostream;
pub mod bitreader;
pub mod demofile;
pub mod demostream;
pub mod entities;
pub mod entityclasses;
pub(crate) mod fielddecoder;
pub(crate) mod fieldmetadata;
pub mod fieldpath;
pub mod fieldvalue;
pub mod flattenedserializers;
pub mod fxhash;
pub(crate) mod instancebaseline;
#[cfg(feature = "async")]
pub mod packet_channel_broadcast_stream;
#[cfg(feature = "async")]
pub mod packet_channel_demo_stream;
#[cfg(feature = "async")]
pub mod packet_source;
pub mod parser;
pub(crate) mod quantizedfloat;
pub mod stringtables;

// own crate re-exports
pub(crate) use haste_vartype as vartype;
// external re-resports
pub use valveprotos;

// TOOD: more optimizations, specifically look into
// https://agourlay.github.io/rust-performance-retrospective-part2/

// TODO: change type of buf from &[u8] to Bytes to maybe avoid some copying; see
// https://github.com/tokio-rs/prost/issues/571. or maybe look into zerycopy
// thingie https://github.com/google/zerocopy

// TODO: compose performance comparisons (manta and clarity); use ticks per
// second as metric (inspired by
// https://github.com/markus-wa/demoinfocs-golang?tab=readme-ov-file#performance--benchmarks).

// TODO: don't ignore length of vectors (dynamic length arrays) because they may
// contain garbage; see
// https://github.com/markus-wa/demoinfocs-golang/issues/450 for details.

// TODO: generate list of entities (/flattened serializers) where it'll be
// possible to get "the thing" by name hash and construct it.
// probably use RecvTable and RecvProp "terms".
// refs?
// - https://developer.valvesoftware.com/wiki/Networking_Entities
// - public/dt_recv.h
// - engine/dt_recv_eng.h

// TODO: abilities, items, heroes, modifiers, etc.. are represented as strings
// in replays, for example "dota_npc_hero_zuus" (according to Ken); string
// comparisons are expensive. valve mostly uses CUtlStringToken which computes a
// hash and uses it for comparisons, it discards the string - this is nice. see
// public/tier1/utlstringtoken.h

// TODO: figure out combat log

// TODO(blukai): figure out a more efficient representation for entity state. hashbrown is fast,
// but that stuff can be faster. this probably will also change how entity field lookups need to be
// performed.

// TODO(blukai): get rid of stupid fat pointers (Arc) in flattened serializers. do the gen vec
// thing, but without gen part.

// NOTE(blukai): don't overuse/overrely on Result. it slows things down very significantly on hot
// code (for example field value decoder); here's an artice that i managed to find that talks more
// about the Try trait - https://agourlay.github.io/rust-performance-retrospective-part3/
