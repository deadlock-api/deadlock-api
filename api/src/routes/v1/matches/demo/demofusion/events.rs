#![allow(clippy::all)]
#![allow(clippy::pedantic)]
#![allow(unreachable_pub)]
#![allow(unused_variables)]

// Include the generated event types and functions
include!(concat!(env!("OUT_DIR"), "/events_generated.rs"));
