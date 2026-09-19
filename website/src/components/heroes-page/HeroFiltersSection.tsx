import { Filter } from "~/components/Filter";
import { FilterToggleCell } from "~/components/Filter/FilterCell";
import { HeroCombFilters } from "~/components/heroes-page/HeroCombFilters";
import { STATS_TABS, type useHeroFilters } from "~/hooks/useHeroFilters";

const LANE_OPTIONS = [
  { value: "same", label: "Same lane" },
  { value: "any", label: "Any lane" },
] as const;

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
          <Filter.MinMatches value={minHeroMatches} onChange={setMinHeroMatches} label="Matches (range)" step={10} />
          <Filter.MinMatches
            value={minHeroMatchesTotal}
            onChange={setMinHeroMatchesTotal}
            label="Matches (total)"
            step={10}
          />
        </>
      ) : (
        <Filter.MinMatches value={minMatches} onChange={setMinMatches} label="Matches" step={10} defaultValue={10} />
      )}
      <Filter.ModeWithRank
        mode={mode}
        onModeChange={setMode}
        hideRankRange={tab === "stats-by-rank"}
        minRank={minRankId}
        maxRank={maxRankId}
        defaultMinRank={91}
        defaultMaxRank={116}
        onRankChange={(min, max) => {
          setMinRankId(min);
          setMaxRankId(max);
        }}
      />
      <Filter.SeasonPatchDate
        startDate={startDate}
        endDate={endDate}
        onDateChange={handleDateChange}
        resetRange={defaultRange}
      />
      {tab === "hero-combs" && <HeroCombFilters />}
      {(tab === "matchups" || tab === "hero-matchup-details") && (
        <FilterToggleCell
          label="Lane"
          value={sameLaneFilter ? "same" : "any"}
          onValueChange={(v) => setSameLaneFilter(v === "same")}
          options={LANE_OPTIONS}
          active={!sameLaneFilter}
          onReset={() => setSameLaneFilter(true)}
        />
      )}
    </Filter.Root>
  );
}
