import { useQuery } from "@tanstack/react-query";

import { useHeroById } from "~/hooks/useAssetById";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { type CompareFilters, compareSuggestionsParams } from "~/queries/player-compare-queries";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";

/**
 * The strongest player on the page's filters who is not in the comparison yet: the best win rate at Ascendant and
 * above, on the chosen hero when there is one. `label` names the pick for the button that adds them.
 */
export function useTopPlayerSuggestion(filters: CompareFilters, excludeAccountIds: readonly number[]) {
  const { hero } = useHeroById(filters.heroId ?? 0);
  const query = useQuery(playerScoreboardQueryOptions(compareSuggestionsParams(filters)));
  const next = query.data?.find((entry) => !excludeAccountIds.includes(entry.account_id));
  const heroName = filters.heroId != null ? hero?.name : undefined;
  const { profiles } = useSteamProfiles(next ? [next.account_id] : []);
  return {
    accountId: next?.account_id,
    /** Who the button adds, for its accessible name. */
    name: next ? (profiles[next.account_id]?.personaname ?? `Player ${next.account_id}`) : undefined,
    label: heroName ? `Add top ${heroName} player` : "Add a top player",
    isPending: query.isPending,
  };
}
