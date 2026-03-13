import { DimensionToggleFilter } from "./DimensionToggleFilter";
import { GameModeFilter } from "./GameModeFilter";
import { GameModeWithRankFilter } from "./GameModeWithRankFilter";
import { HeatmapViewModeFilter } from "./HeatmapViewModeFilter";
import { HeroFilter } from "./HeroFilter";
import { ItemsTriStateFilter } from "./ItemsTriStateFilter";
import { MatchDurationFilter } from "./MatchDurationFilter";
import { MinMatchesFilter } from "./MinMatchesFilter";
import { PatchOrDateFilter } from "./PatchOrDateFilter";
import { RankRangeFilter } from "./RankRangeFilter";
import { RegionFilter } from "./RegionFilter";
import { Root } from "./Root";
import { SortByFilter } from "./SortByFilter";
import { SortDirectionFilter } from "./SortDirectionFilter";
import { TeamFilter } from "./TeamFilter";
import { TimeRangeFilter } from "./TimeRangeFilter";

export const Filter = {
  Root,
  Hero: HeroFilter,
  Region: RegionFilter,
  GameMode: GameModeFilter,
  RankRange: RankRangeFilter,
  GameModeWithRank: GameModeWithRankFilter,
  MinMatches: MinMatchesFilter,
  PatchOrDate: PatchOrDateFilter,
  TimeRange: TimeRangeFilter,
  MatchDuration: MatchDurationFilter,
  HeatmapViewMode: HeatmapViewModeFilter,
  DimensionToggle: DimensionToggleFilter,
  ItemsTriState: ItemsTriStateFilter,
  SortBy: SortByFilter,
  SortDirection: SortDirectionFilter,
  Team: TeamFilter,
};
