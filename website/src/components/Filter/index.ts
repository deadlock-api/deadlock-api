import { DimensionToggleFilter } from "./DimensionToggleFilter";
import { GameModeFilter } from "./GameModeFilter";
import { GameModeWithRankFilter } from "./GameModeWithRankFilter";
import { HeatmapViewModeFilter } from "./HeatmapViewModeFilter";
import { HeroFilter } from "./HeroFilter";
import { ItemsTriStateFilter } from "./ItemsTriStateFilter";
import { MatchDurationFilter } from "./MatchDurationFilter";
import { MinMatchesFilter } from "./MinMatchesFilter";
import { RankRangeFilter } from "./RankRangeFilter";
import { RegionFilter } from "./RegionFilter";
import { Root } from "./Root";
import { SeasonPatchDateFilter } from "./SeasonPatchDateFilter";
import { SortByFilter } from "./SortByFilter";
import { SortDirectionFilter } from "./SortDirectionFilter";
import { TeamFilter } from "./TeamFilter";
import { TimeRangeFilter } from "./TimeRangeFilter";

export const Filter = {
  Root,
  Hero: HeroFilter,
  Region: RegionFilter,
  GameMode: GameModeFilter,
  GameModeWithRank: GameModeWithRankFilter,
  RankRange: RankRangeFilter,
  MinMatches: MinMatchesFilter,
  ItemsTriState: ItemsTriStateFilter,
  SeasonPatchDate: SeasonPatchDateFilter,
  MatchDuration: MatchDurationFilter,
  Team: TeamFilter,
  HeatmapViewMode: HeatmapViewModeFilter,
  DimensionToggle: DimensionToggleFilter,
  TimeRange: TimeRangeFilter,
  SortBy: SortByFilter,
  SortDirection: SortDirectionFilter,
};
