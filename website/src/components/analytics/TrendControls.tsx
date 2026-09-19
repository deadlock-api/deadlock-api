import { ChartToolbar } from "~/components/analytics/ChartToolbar";
import { MetricSelect } from "~/components/analytics/MetricSelect";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useHydrated } from "~/hooks/useHydrated";

type Option = { value: string; label: string };

/** Compact, URL-state-agnostic controls shared by historical analytics charts. */
export function TrendControls({
  title,
  metric,
  metricGroups,
  onMetricChange,
  interval,
  intervals,
  onIntervalChange,
}: {
  title: string;
  metric: string;
  metricGroups: readonly { label: string; options: readonly Option[] }[];
  onMetricChange: (value: string) => void;
  interval: string;
  intervals: readonly Option[];
  onIntervalChange: (value: string) => void;
}) {
  const hydrated = useHydrated();

  return (
    <ChartToolbar title={title} label="Trend controls">
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <span className="text-xs text-muted-foreground">Metric</span>
        <MetricSelect value={metric} groups={metricGroups} onChange={onMetricChange} />
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">Group by</span>
        <ToggleGroup
          disabled={!hydrated}
          type="single"
          size="sm"
          variant="outline"
          aria-label="Time Interval"
          value={interval}
          onValueChange={(value) => value && onIntervalChange(value)}
        >
          {intervals.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </ChartToolbar>
  );
}
