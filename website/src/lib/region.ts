import { LeaderboardRegionEnum } from "deadlock_api_client";

const SA_COUNTRIES = ["br", "ar", "cl", "co", "pe", "ve", "uy", "py", "bo", "ec", "gf", "sr", "gy"];

const NA_COUNTRIES = [
  "us",
  "ca",
  "mx",
  "gt",
  "hn",
  "sv",
  "ni",
  "cr",
  "pa",
  "bz",
  "cu",
  "do",
  "pr",
  "jm",
  "tt",
  "bb",
  "bs",
  "ht",
];

const OC_COUNTRIES = ["au", "nz", "fj", "pg", "sb", "vu", "to", "ws", "ki", "nr", "tv", "ck", "nu", "tk", "pf", "nc"];

const ASIA_COUNTRIES = [
  "jp",
  "kr",
  "kp",
  "cn",
  "tw",
  "hk",
  "mo",
  "sg",
  "th",
  "vn",
  "ph",
  "my",
  "id",
  "mm",
  "kh",
  "la",
  "bn",
  "in",
  "bd",
  "pk",
  "lk",
  "np",
  "bt",
  "mn",
  "kz",
  "kg",
  "uz",
  "tj",
  "tm",
  "af",
];

const ASIA_LANGS = [
  "ja",
  "ko",
  "zh",
  "th",
  "vi",
  "id",
  "ms",
  "tl",
  "fil",
  "km",
  "lo",
  "my",
  "hi",
  "bn",
  "ta",
  "te",
  "ml",
  "kn",
  "mr",
  "gu",
  "pa",
  "si",
  "ne",
  "ur",
  "mn",
  "bo",
  "dz",
];

/** Maps an ISO 3166-1 alpha-2 country code to a leaderboard region; undefined when the country is not listed. */
export function regionForCountry(country: string | undefined): LeaderboardRegionEnum | undefined {
  const code = country?.toLowerCase();
  if (!code) return undefined;
  if (SA_COUNTRIES.includes(code)) return LeaderboardRegionEnum.SAmerica;
  if (NA_COUNTRIES.includes(code)) return LeaderboardRegionEnum.NAmerica;
  if (OC_COUNTRIES.includes(code)) return LeaderboardRegionEnum.Oceania;
  if (ASIA_COUNTRIES.includes(code)) return LeaderboardRegionEnum.Asia;
  return undefined;
}

/** Guesses a leaderboard region from a BCP 47 language tag such as "pt-BR" or "ja". */
export function regionForLanguage(lang: string): LeaderboardRegionEnum {
  const [langPrefix, country] = lang.toLowerCase().split("-");
  const byCountry = regionForCountry(country);
  if (byCountry) return byCountry;
  if (ASIA_LANGS.includes(langPrefix)) return LeaderboardRegionEnum.Asia;
  if (langPrefix === "pt") return LeaderboardRegionEnum.SAmerica;
  return LeaderboardRegionEnum.Europe;
}

export function getDefaultRegion(): LeaderboardRegionEnum {
  if (typeof navigator === "undefined") return LeaderboardRegionEnum.Europe;
  return regionForLanguage(navigator.language ?? "");
}
