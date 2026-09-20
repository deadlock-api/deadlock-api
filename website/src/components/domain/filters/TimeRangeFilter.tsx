import {
  MatchTimeRangeSelector,
  type MatchTimeRangeSelectorProps,
} from "~/components/domain/selectors/MatchTimeRangeSelector";

export function TimeRangeFilter(props: Omit<MatchTimeRangeSelectorProps, "maxLabel" | "step">) {
  return <MatchTimeRangeSelector {...props} />;
}
