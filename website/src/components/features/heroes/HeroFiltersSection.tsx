import { Filter } from "~/components/domain/filters";
import { HeroCombFilters } from "~/components/features/heroes/HeroCombFilters";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";
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
  | "sameLaneFilter"
  | "setSameLaneFilter"
> & {
  /** A `FilterBarEnd` with the controls of the open tab. */
  children?: React.ReactNode;
};

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
  sameLaneFilter,
  setSameLaneFilter,
  children,
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
          <Filter.MinMatches
            value={minHeroMatchesTotal}
            onValueChange={setMinHeroMatchesTotal}
            label="Matches (total)"
            step={10}
          />
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
            setMinRankId(next.rank[0]);
            setMaxRankId(next.rank[1]);
          }
        }}
        hideRankRange={tab === "stats-by-rank"}
      />
      <Filter.SeasonPatchDate
        value={{ startDate, endDate }}
        onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
        defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
      />
      {tab === "hero-combs" && <HeroCombFilters />}
      {(tab === "matchups" || tab === "hero-matchup-details") && (
        <FilterToggleCell
          label="Lane"
          value={sameLaneFilter ? "same" : "any"}
          defaultValue="same"
          onValueChange={(v) => setSameLaneFilter(v === "same")}
        >
          <SegmentedItem value="same">Same lane</SegmentedItem>
          <SegmentedItem value="any">Any lane</SegmentedItem>
        </FilterToggleCell>
      )}
      {children}
    </Filter.Root>
  );
}
