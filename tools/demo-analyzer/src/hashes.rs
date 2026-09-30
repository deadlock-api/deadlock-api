use haste::entities::fkey_from_path;
use haste::fxhash;

pub(crate) const CONTROLLER_HASH: u64 = fxhash::hash_bytes(b"m_hController");
pub(crate) const STEAM_ID_HASH: u64 = fxhash::hash_bytes(b"m_steamID");
pub(crate) const STEAM_NAME_HASH: u64 = fxhash::hash_bytes(b"m_iszPlayerName");
pub(crate) const HERO_BUILD_ID_HASH: u64 = fxhash::hash_bytes(b"m_unHeroBuildID");
pub(crate) const PREGAME_HERO_ID_HASH: u64 =
    fkey_from_path(&["m_PlayerDataGlobal", "m_nPreGameHeroID"]);
/// Game rules' banned heroes (a dynamic array: its length at this key, element `i` at
/// `add_u64_to_hash(key, add_u64_to_hash(0, i))`). Since build 6711 the only place bans appear:
/// the `BannedHeroes` user message is no longer sent.
pub(crate) const BANNED_HEROES_HASH: u64 = fkey_from_path(&["m_pGameRules", "m_vecBannedHeroes"]);
