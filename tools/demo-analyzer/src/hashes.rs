use haste::fxhash;

pub(crate) const CONTROLLER_HASH: u64 = fxhash::hash_bytes(b"m_hController");
pub(crate) const STEAM_ID_HASH: u64 = fxhash::hash_bytes(b"m_steamID");
pub(crate) const HERO_BUILD_ID_HASH: u64 = fxhash::hash_bytes(b"m_unHeroBuildID");
