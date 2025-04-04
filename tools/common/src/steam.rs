const STEAM_ID_IDENT: u64 = 76561197960265728;

pub fn account_id_to_steam_id64(account_id: u32) -> u64 {
    STEAM_ID_IDENT + account_id as u64
}

pub fn steam_id64_to_account_id(steam_id64: u64) -> u32 {
    (steam_id64 - STEAM_ID_IDENT) as u32
}
