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
  children,
}: {
  /** The build's performance totals; undefined while they load or when the request failed. */
  totals: BuildPerformanceTotals | undefined;
  average: BuildPerformanceTotals | null;
  pending: boolean;
  /** A section of its own in the grid, after combat and economy: per-time numbers that need requests of their own. */
  children?: React.ReactNode;
}) {
  if (!totals && !pending) return null;
  const section = ({ group, title }: (typeof GROUPS)[number]) => (
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
  );
  // Two columns and two rows: combat beside economy, then the per-time souls beside survival and support.
  return (
    <div className="@container">
      <div className="grid @lg:grid-cols-2">
        {section(GROUPS[0])}
        {section(GROUPS[1])}
        {children && <div className="flex flex-col">{children}</div>}
        {section(GROUPS[2])}
      </div>
    </div>
  );
}
