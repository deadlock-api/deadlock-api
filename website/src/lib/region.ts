import { LeaderboardRegionEnum } from "deadlock_api_client";

export function getDefaultRegion(): LeaderboardRegionEnum {
  if (typeof navigator === "undefined") return LeaderboardRegionEnum.Europe;
  const lang = navigator.language?.toLowerCase() ?? "";
  const langPrefix = lang.split("-")[0];
  const region = lang.split("-")[1];

  const saCountries = ["br", "ar", "cl", "co", "pe", "ve", "uy", "py", "bo", "ec", "gf", "sr", "gy"];
  if (region && saCountries.includes(region)) return LeaderboardRegionEnum.SAmerica;

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

  const ocCountries = ["au", "nz", "fj", "pg", "sb", "vu", "to", "ws", "ki", "nr", "tv", "ck", "nu", "tk", "pf", "nc"];
  if (region && ocCountries.includes(region)) return LeaderboardRegionEnum.Oceania;

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

  if (langPrefix === "pt") return LeaderboardRegionEnum.SAmerica;

  return LeaderboardRegionEnum.Europe;
}
