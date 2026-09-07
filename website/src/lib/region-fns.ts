import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { LeaderboardRegionEnum } from "deadlock_api_client";

import { regionForCountry, regionForLanguage } from "~/lib/region";

// Cloudflare sets cf-ipcountry on every request; "XX" and "T1" mean unknown / Tor.
export const fetchDefaultRegion = createServerFn({ method: "GET" }).handler((): LeaderboardRegionEnum => {
  const country = getRequestHeader("cf-ipcountry");
  if (country && country !== "XX" && country !== "T1") {
    return regionForCountry(country) ?? LeaderboardRegionEnum.Europe;
  }
  const acceptLanguage = getRequestHeader("accept-language")?.split(",")[0]?.trim() ?? "";
  return regionForLanguage(acceptLanguage);
});
