import { DimensionToggleFilter } from "~/components/domain/filters/DimensionToggleFilter";
import { HeatmapViewModeFilter } from "~/components/domain/filters/HeatmapViewModeFilter";
import { ItemsTriStateFilter } from "~/components/domain/filters/ItemsTriStateFilter";
import { MatchDurationFilter } from "~/components/domain/filters/MatchDurationFilter";
import { MinMatchesFilter } from "~/components/domain/filters/MinMatchesFilter";
import { ModeWithRankFilter } from "~/components/domain/filters/ModeWithRankFilter";
import { RegionFilter } from "~/components/domain/filters/RegionFilter";
import { TeamFilter } from "~/components/domain/filters/TeamFilter";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { MatchTimeRangeSelector } from "~/components/domain/selectors/MatchTimeRangeSelector";
import { SeasonPatchDatePicker } from "~/components/domain/selectors/SeasonPatchDatePicker";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";

export const Filter = {
  Root: FilterBar,
  Hero: HeroSelector,
  Region: RegionFilter,
  ModeWithRank: ModeWithRankFilter,
  MinMatches: MinMatchesFilter,
  ItemsTriState: ItemsTriStateFilter,
  SeasonPatchDate: SeasonPatchDatePicker,
  MatchDuration: MatchDurationFilter,
  Team: TeamFilter,
  HeatmapViewMode: HeatmapViewModeFilter,
  DimensionToggle: DimensionToggleFilter,
  TimeRange: MatchTimeRangeSelector,
};
