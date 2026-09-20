import { ItemsTriStateFilter } from "~/components/domain/filters/ItemsTriStateFilter";
import { MatchDurationFilter } from "~/components/domain/filters/MatchDurationFilter";
import { MinMatchesFilter } from "~/components/domain/filters/MinMatchesFilter";
import { ModeWithRankFilter } from "~/components/domain/filters/ModeWithRankFilter";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { MatchTimeRangeSelector } from "~/components/domain/selectors/MatchTimeRangeSelector";
import { SeasonPatchDatePicker } from "~/components/domain/selectors/SeasonPatchDatePicker";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";

export const Filter = {
  Root: FilterBar,
  Hero: HeroSelector,
  ModeWithRank: ModeWithRankFilter,
  MinMatches: MinMatchesFilter,
  ItemsTriState: ItemsTriStateFilter,
  SeasonPatchDate: SeasonPatchDatePicker,
  MatchDuration: MatchDurationFilter,
  TimeRange: MatchTimeRangeSelector,
};
