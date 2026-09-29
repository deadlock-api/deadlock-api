import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { LeaderboardRegionEnum } from "deadlock_api_client";

import { regionForRequest } from "~/lib/region";

export const fetchDefaultRegion = createServerFn({ method: "GET" }).handler((): LeaderboardRegionEnum =>
  regionForRequest(getRequestHeader("cf-ipcountry"), getRequestHeader("accept-language")),
);
