import { PanelSection } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { BUILD_METRICS, type BuildPerformanceTotals, metricDelta, type MetricGroup } from "~/lib/build-performance";

const GROUPS: { group: MetricGroup; title: string }[] = [
  { group: "combat", title: "Combat" },
  { group: "economy", title: "Economy" },
  { group: "support", title: "Survival and support" },
];

/**
 * How the build's players play, per match or per minute, each number against the hero's average build (every listed
 * build pooled): the difference is colored only where more is clearly better or worse.
 */
export function BuildPlaystyle({
  totals,
  average,
  pending,
}: {
  /** The build's performance totals; undefined while they load or when the request failed. */
  totals: BuildPerformanceTotals | undefined;
  average: BuildPerformanceTotals | null;
  pending: boolean;
}) {
  if (!totals && !pending) return null;
  return GROUPS.map(({ group, title }) => (
    <section key={group} className="flex flex-col">
      <PanelSection title={title} />
      <KeyValueList className="px-3 py-0.5">
        {BUILD_METRICS.filter((metric) => metric.group === group).map((metric) => {
          const value = totals ? metric.value(totals) : null;
          const delta = metricDelta(metric, value, average ? metric.value(average) : null);
          return (
            <KeyValue
              key={metric.key}
              label={metric.label}
              value={
                pending && !totals ? (
                  <Skeleton className="ms-auto h-4 w-20" />
                ) : (
                  <span className="inline-flex items-baseline gap-2">
                    {value === null ? <NoValue /> : metric.format(value)}
                    <span className="w-14 text-end text-xs">
                      <Delta
                        value={delta}
                        unit={metric.delta === "points" ? " pp" : undefined}
                        polarity={metric.polarity}
                      />
                    </span>
                  </span>
                )
              }
            />
          );
        })}
      </KeyValueList>
    </section>
  ));
}
