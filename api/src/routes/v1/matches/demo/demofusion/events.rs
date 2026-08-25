#![expect(clippy::all)]
#![expect(clippy::pedantic)]
#![expect(unreachable_pub)]
#![expect(unused_variables)]

// Include the generated event types and functions
include!(concat!(env!("OUT_DIR"), "/events_generated.rs"));
