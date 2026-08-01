import { useQuery } from "@tanstack/react-query";

import type { SeasonInfo } from "~/lib/seasons";
import { rankedSeasonsQueryOptions } from "~/queries/asset-queries";

const NO_SEASONS: SeasonInfo[] = [];

export function useSeasons(): { seasons: SeasonInfo[]; isPending: boolean } {
  const { data, isPending } = useQuery(rankedSeasonsQueryOptions);
  return { seasons: data ?? NO_SEASONS, isPending };
}
