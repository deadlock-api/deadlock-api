import { LeaderboardRegionEnum } from "deadlock_api_client";

export function getDefaultRegion(): LeaderboardRegionEnum {
  const lang = navigator.language?.toLowerCase() ?? "";
  const langPrefix = lang.split("-")[0];
  const region = lang.split("-")[1];

  // South American country codes
  const saCountries = ["br", "ar", "cl", "co", "pe", "ve", "uy", "py", "bo", "ec", "gf", "sr", "gy"];
  if (region && saCountries.includes(region)) return LeaderboardRegionEnum.SAmerica;

  // Central American / Caribbean country codes → NAmerica
  const naCountries = [
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
  if (region && naCountries.includes(region)) return LeaderboardRegionEnum.NAmerica;

  // Oceania country codes
  const ocCountries = ["au", "nz", "fj", "pg", "sb", "vu", "to", "ws", "ki", "nr", "tv", "ck", "nu", "tk", "pf", "nc"];
  if (region && ocCountries.includes(region)) return LeaderboardRegionEnum.Oceania;

  // Asian country codes
  const asiaCountries = [
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
  if (region && asiaCountries.includes(region)) return LeaderboardRegionEnum.Asia;

  // Asian languages (when no region code or region not matched above)
  const asiaLangs = [
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
  if (asiaLangs.includes(langPrefix)) return LeaderboardRegionEnum.Asia;

  // Portuguese without region → likely Brazil
  if (langPrefix === "pt") return LeaderboardRegionEnum.SAmerica;

  // Fallback to Europe (covers EU, Middle East, Africa, and anything else)
  return LeaderboardRegionEnum.Europe;
}
