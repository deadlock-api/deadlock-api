//! Deadlock game assets: turns the versioned `.vdata`, CSS and localization files published to
//! R2 into the public `/v1/assets` (legacy `/v2`) JSON.
//!
//! The API serves it over `/v1/assets` and GraphQL. Features `utoipa`, `graphql` and `schemars`
//! add the `OpenAPI`, `async-graphql` and JSON schema derives.

#![forbid(unsafe_code)]
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
#![cfg_attr(
    feature = "graphql",
    expect(
        clippy::unused_async_trait_impl,
        reason = "async-graphql's `Enum` derive emits async resolvers without `.await`"
    )
)]

pub mod client;
pub mod index;
pub mod types;
pub mod versions;
