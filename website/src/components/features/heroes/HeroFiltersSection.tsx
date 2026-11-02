import { throttle } from "nuqs";
import { startTransition } from "react";

import { Filter } from "~/components/domain/filters";
import { DEFAULT_MIN_MATCHES, STATS_TABS, type useHeroFilters } from "~/hooks/useHeroFilters";
import { DEFAULT_MODE } from "~/lib/game-mode";
import { DEFAULT_RANK_RANGE } from "~/lib/rank-utils";

type HeroFiltersProps = Pick<
  ReturnType<typeof useHeroFilters>,
  | "tab"
  | "minHeroMatches"
  | "setMinHeroMatches"
  | "minHeroMatchesTotal"
  | "setMinHeroMatchesTotal"
  | "minMatches"
  | "setMinMatches"
  | "mode"
  | "setMode"
  | "minRankId"
  | "maxRankId"
  | "setMinRankId"
  | "setMaxRankId"
  | "startDate"
  | "endDate"
  | "handleDateChange"
  | "defaultRange"
> & {
  /** The open tab's own controls, after the page's filters in the same row. */
  children?: React.ReactNode;
};

const together = { limitUrlUpdates: throttle(50) };

export function HeroFiltersSection({
  tab,
  minHeroMatches,
  setMinHeroMatches,
  minHeroMatchesTotal,
  setMinHeroMatchesTotal,
  minMatches,
  setMinMatches,
  mode,
  setMode,
  minRankId,
  maxRankId,
  setMinRankId,
  setMaxRankId,
  startDate,
  endDate,
  handleDateChange,
  defaultRange,
  children,
}: HeroFiltersProps) {
  const statsTab = STATS_TABS.includes(tab);
  // By Experience buckets heroes by a player's own match count, which replaces the total threshold.
  const showTotal = statsTab && tab !== "stats-by-experience";
  return (
    <Filter.Root>
      <Filter.ModeWithRank
        value={{ mode, rank: [minRankId, maxRankId] }}
        defaultValue={{ mode: DEFAULT_MODE, rank: [DEFAULT_RANK_RANGE.min, DEFAULT_RANK_RANGE.max] }}
        onValueChange={(next) => {
          if (next.mode !== mode) setMode(next.mode);
          if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
            // Both bounds in one throttled URL update, and the table re-renders in a transition so the tap paints first.
            startTransition(() => {
              void setMinRankId(next.rank[0], together);
              void setMaxRankId(next.rank[1], together);
            });
          }
        }}
        hideRankRange={tab === "stats-by-rank"}
      />
      <Filter.SeasonPatchDate
        value={{ startDate, endDate }}
        onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
        defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
      />
      <>
        {statsTab ? (
          <>
            <Filter.MinMatches
              value={minHeroMatches}
              onValueChange={(next) => startTransition(() => void setMinHeroMatches(next, together))}
              label="Matches (range)"
              step={10}
              defaultValue={0}
            />
            {showTotal && (
              <Filter.MinMatches
                value={minHeroMatchesTotal}
                onValueChange={(next) => startTransition(() => void setMinHeroMatchesTotal(next, together))}
                label="Matches (total)"
                step={10}
                defaultValue={0}
              />
            )}
          </>
        ) : (
          <Filter.MinMatches
            value={minMatches}
            onValueChange={(next) => startTransition(() => void setMinMatches(next, together))}
            label="Matches"
            step={10}
            defaultValue={DEFAULT_MIN_MATCHES}
          />
        )}
      </>
      {children}
    </Filter.Root>
  );
}
