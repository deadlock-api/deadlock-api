import { Filter } from "~/components/domain/filters";
import { DEFAULT_MODE } from "~/components/domain/selectors/ModeSelector";
import { HeroCombFilters } from "~/components/features/heroes/HeroCombFilters";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";
import { STATS_TABS, type useHeroFilters } from "~/hooks/useHeroFilters";

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
  sameLaneFilter,
  setSameLaneFilter,
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
        resetRange={defaultRange}
      />
      {tab === "hero-combs" && <HeroCombFilters />}
      {(tab === "matchups" || tab === "hero-matchup-details") && (
        <FilterToggleCell
          label="Lane"
          value={sameLaneFilter ? "same" : "any"}
          onValueChange={(v) => setSameLaneFilter(v === "same")}
          active={!sameLaneFilter}
          onReset={() => setSameLaneFilter(true)}
        >
          <SegmentedItem value="same">Same lane</SegmentedItem>
          <SegmentedItem value="any">Any lane</SegmentedItem>
        </FilterToggleCell>
      )}
    </Filter.Root>
  );
}
