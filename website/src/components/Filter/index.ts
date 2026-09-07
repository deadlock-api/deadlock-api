import { DimensionToggleFilter } from "./DimensionToggleFilter";
import { HeatmapViewModeFilter } from "./HeatmapViewModeFilter";
import { HeroFilter } from "./HeroFilter";
import { ItemsTriStateFilter } from "./ItemsTriStateFilter";
import { MatchDurationFilter } from "./MatchDurationFilter";
import { MinMatchesFilter } from "./MinMatchesFilter";
import { ModeWithRankFilter } from "./ModeWithRankFilter";
import { RegionFilter } from "./RegionFilter";
import { Root } from "./Root";
import { SeasonPatchDateFilter } from "./SeasonPatchDateFilter";
import { TeamFilter } from "./TeamFilter";
import { TimeRangeFilter } from "./TimeRangeFilter";

export const Filter = {
  Root,
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
