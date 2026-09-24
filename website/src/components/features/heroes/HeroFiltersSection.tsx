import { Filter } from "~/components/domain/filters";
import { STATS_TABS, type useHeroFilters } from "~/hooks/useHeroFilters";
import { DEFAULT_MODE } from "~/lib/game-mode";

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
>;

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
}: HeroFiltersProps) {
  return (
    <Filter.Root>
      {STATS_TABS.includes(tab) ? (
        <>
          <Filter.MinMatches
            value={minHeroMatches}
            onValueChange={setMinHeroMatches}
            label="Matches (range)"
            step={10}
          />
          {/* By Experience buckets heroes by a player's own match count, which replaces the total threshold. */}
          {tab !== "stats-by-experience" && (
            <Filter.MinMatches
              value={minHeroMatchesTotal}
              onValueChange={setMinHeroMatchesTotal}
              label="Matches (total)"
              step={10}
            />
          )}
        </>
      ) : (
        <Filter.MinMatches
          value={minMatches}
          onValueChange={setMinMatches}
          label="Matches"
          step={10}
          defaultValue={10}
        />
      )}
      <Filter.ModeWithRank
        value={{ mode, rank: [minRankId, maxRankId] }}
        defaultValue={{ mode: DEFAULT_MODE, rank: [91, 116] }}
        onValueChange={(next) => {
          if (next.mode !== mode) setMode(next.mode);
          if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
            void setMinRankId(next.rank[0]);
            void setMaxRankId(next.rank[1]);
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
