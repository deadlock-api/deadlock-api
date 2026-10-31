import { throttle } from "nuqs";
import { startTransition } from "react";

import { Filter } from "~/components/domain/filters";
import type { useHeroFilters } from "~/hooks/useHeroFilters";
import { DEFAULT_MODE } from "~/lib/game-mode";
import { DEFAULT_RANK_RANGE } from "~/lib/rank-utils";

type HeroFiltersProps = Pick<
  ReturnType<typeof useHeroFilters>,
  | "tab"
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
>;

const together = { limitUrlUpdates: throttle(50) };

export function HeroFiltersSection({
  tab,
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
}: HeroFiltersProps) {
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
    </Filter.Root>
  );
}
