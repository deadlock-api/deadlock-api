pub(crate) mod client;
pub(crate) mod extractor;
pub(crate) mod jwt;
pub(crate) mod membership;
pub(crate) mod repository;
pub(crate) mod steam_accounts_repository;
pub(crate) mod types;
pub(crate) mod verification_job;
pub(crate) mod webhook_types;

/// The cookie carrying a patron's session JWT.
pub(crate) const SESSION_COOKIE: &str = "patron_session";
