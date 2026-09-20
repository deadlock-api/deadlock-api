import { DimensionToggleFilter } from "~/components/domain/filters/DimensionToggleFilter";
import { HeatmapViewModeFilter } from "~/components/domain/filters/HeatmapViewModeFilter";
import { HeroFilter } from "~/components/domain/filters/HeroFilter";
import { ItemsTriStateFilter } from "~/components/domain/filters/ItemsTriStateFilter";
import { MatchDurationFilter } from "~/components/domain/filters/MatchDurationFilter";
import { MinMatchesFilter } from "~/components/domain/filters/MinMatchesFilter";
import { ModeWithRankFilter } from "~/components/domain/filters/ModeWithRankFilter";
import { RegionFilter } from "~/components/domain/filters/RegionFilter";
import { SeasonPatchDateFilter } from "~/components/domain/filters/SeasonPatchDateFilter";
import { TeamFilter } from "~/components/domain/filters/TeamFilter";
import { TimeRangeFilter } from "~/components/domain/filters/TimeRangeFilter";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";

export const Filter = {
  Root: FilterBar,
  Hero: HeroFilter,
  Region: RegionFilter,
  ModeWithRank: ModeWithRankFilter,
  MinMatches: MinMatchesFilter,
  ItemsTriState: ItemsTriStateFilter,
  SeasonPatchDate: SeasonPatchDateFilter,
  MatchDuration: MatchDurationFilter,
  Team: TeamFilter,
  HeatmapViewMode: HeatmapViewModeFilter,
  DimensionToggle: DimensionToggleFilter,
  TimeRange: TimeRangeFilter,
};
