const STEAM_ID_64_BASE = 76561197960265728n;

/**
 * Parse a raw Steam ID input string (SteamID64, SteamID3, or bracket format)
 * into a SteamID3 string. Returns the input unchanged if parsing fails.
 */
export function parseSteamIdToId3(input: string): string {
  try {
    let extractedSteamId = BigInt(
      input
        .replace(/\[U:\d+:/g, "")
        .replace(/U:\d+:/g, "")
        .replace(/\[STEAM_0:\d+:/g, "")
        .replace(/STEAM_0:\d+:/g, "")
        .replace(/]/g, ""),
    );
    if (extractedSteamId > STEAM_ID_64_BASE) extractedSteamId -= STEAM_ID_64_BASE;
    return extractedSteamId.toString();
  } catch {
    return input;
  }
}
