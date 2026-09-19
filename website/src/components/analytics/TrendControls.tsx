import { ChartNoAxesCombined } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
  const metricLabel =
    metricGroups.flatMap((group) => group.options).find((option) => option.value === metric)?.label ?? metric;

  return (
    <section
      aria-label="Trend controls"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2"
    >
      <div className="sr-only sm:not-sr-only sm:mr-auto sm:flex sm:items-center sm:gap-2">
        <ChartNoAxesCombined className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <span className="text-xs text-muted-foreground">Metric</span>
        <Select disabled={!hydrated} value={metric} onValueChange={onMetricChange}>
          <SelectTrigger
            size="sm"
            aria-label="Trend metric"
            title={metricLabel}
            className="w-full min-w-0 sm:w-auto sm:max-w-72 sm:min-w-52"
          >
            <SelectValue>{metricLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {metricGroups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Group by</span>
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
    </section>
  );
}
