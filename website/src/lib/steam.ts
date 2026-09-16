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
 * Convert a SteamID64 to SteamID3
 */
export function steamId64ToSteamId3(steamId64: string): number {
  const id3 = BigInt(steamId64) - STEAM_ID_64_BASE;
  return Number(id3);
}
