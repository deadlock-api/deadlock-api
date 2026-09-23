const STEAM_ID_64_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 4294967295n;

/**
 * Normalize public individual SteamID64, account IDs, U:1 account IDs, or legacy STEAM_0/1:Y:Z IDs.
 * Named formats may have matching brackets. Returns the input unchanged if parsing fails.
 */
export function parseSteamIdToId3(input: string): string {
  const trimmed = input.trim();
  const named = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  const legacy = /^STEAM_[01]:([01]):(\d+)$/.exec(named);
  const steam3 = /^U:1:(\d+)$/.exec(named);
  let accountId: bigint;
  if (legacy) {
    // STEAM_X:Y:Z splits the account number into its low bit Y and remaining bits Z.
    accountId = BigInt(legacy[2]) * 2n + BigInt(legacy[1]);
  } else if (steam3) {
    accountId = BigInt(steam3[1]);
  } else if (/^\d+$/.test(trimmed)) {
    const value = BigInt(trimmed);
    accountId = value >= STEAM_ID_64_BASE ? value - STEAM_ID_64_BASE : value;
  } else return input;

  return accountId <= MAX_ACCOUNT_ID ? accountId.toString() : input;
}

/**
 * Validate and parse a Steam ID input: a SteamID64, an account ID, `[U:1:x]`, `STEAM_x:y:z`, or a
 * steamcommunity.com/profiles/<id64> link.
 */
export function parseSteamIdInput(input: string): { steamId3: number } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Steam ID is required" };

  const profile = /steamcommunity\.com\/profiles\/(\d+)/i.exec(trimmed);
  if (/steamcommunity\.com\/id\//i.test(trimmed)) {
    return { error: "Custom profile links cannot be read. Paste your SteamID64 or account ID instead." };
  }
  const parsed = parseSteamIdToId3(profile ? profile[1] : trimmed);
  if (!/^\d+$/.test(parsed)) {
    return { error: "Enter a SteamID64, an account ID, [U:1:…], STEAM_0:…, or a steamcommunity.com/profiles/ link" };
  }
  const steamId3 = Number(parsed);
  if (steamId3 === 0 || BigInt(steamId3) > MAX_ACCOUNT_ID) return { error: "Invalid Steam ID" };
  return { steamId3 };
}

/**
 * Convert a SteamID64 to SteamID3
 */
export function steamId64ToSteamId3(steamId64: string): number {
  const id3 = BigInt(steamId64) - STEAM_ID_64_BASE;
  return Number(id3);
}
