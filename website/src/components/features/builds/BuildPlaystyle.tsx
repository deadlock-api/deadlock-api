import type { EndOfMatchDistribution } from "~/components/features/builds/build-hooks";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { GAUSSIAN_COLORS, GaussianComparison } from "~/components/patterns/charts/GaussianComparison";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip, TooltipHeader, TooltipTarget } from "~/components/ui/tooltip";
import {
  BUILD_METRICS,
  type BuildPerformanceTotals,
  metricDelta,
  type MetricGroup,
  metricNoise,
} from "~/lib/build-performance";

/** A metric's spread at the end of the match: the build's curve over the hero's. */
function DistributionCard({ title, distribution }: { title: string; distribution: EndOfMatchDistribution }) {
  return (
    <div className="flex flex-col gap-2">
      <TooltipHeader title={title} subtitle="At the end of the match" />
      <GaussianComparison
        value={distribution.value}
        reference={distribution.reference}
        label={`${title} at the end of the match, this build against the hero`}
      />
      <ChartLegend label="Curves">
        <ChartLegendItem color={GAUSSIAN_COLORS.value} shape="line">
          This build
        </ChartLegendItem>
        <ChartLegendItem color={GAUSSIAN_COLORS.reference} shape="dashed">
          Hero average
        </ChartLegendItem>
      </ChartLegend>
    </div>
  );
}

const NO_DISTRIBUTIONS: Partial<Record<string, EndOfMatchDistribution>> = {};

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
  distributions = NO_DISTRIBUTIONS,
  children,
  trailing,
}: {
  /** The build's performance totals; undefined while they load or when the request failed. */
  totals: BuildPerformanceTotals | undefined;
  average: BuildPerformanceTotals | null;
  pending: boolean;
  /** The end-of-match distributions behind some metrics, by metric key: their value opens a plot of the two. */
  distributions?: Partial<Record<string, EndOfMatchDistribution>>;
  /** A section of its own in the grid, after combat and economy: per-time numbers that need requests of their own. */
  children?: React.ReactNode;
  /** Sections under survival and support, in its column: the build's course over the match beside the souls. */
  trailing?: React.ReactNode;
}) {
  if (!totals && !pending) return null;
  const section = ({ group, title }: (typeof GROUPS)[number]) => (
    <section key={group} className="flex flex-col">
      <PanelSection variant="label" title={title} />
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
                    {value === null ? (
                      <NoValue />
                    ) : distributions[metric.key] ? (
                      <Tooltip
                        variant="preview"
                        content={<DistributionCard title={metric.label} distribution={distributions[metric.key]!} />}
                      >
                        <TooltipTarget underline="dashed">{metric.format(value)}</TooltipTarget>
                      </Tooltip>
                    ) : (
                      metric.format(value)
                    )}
                    <span className="w-14 text-end text-xs">
                      <Delta
                        value={delta}
                        unit={metric.delta === "points" ? " pp" : undefined}
                        polarity={metric.polarity}
                        threshold={metricNoise(metric)}
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
  // Two columns and two rows: combat beside economy, then the per-time souls beside survival and support with the
  // trailing sections under it. A panel with the page's full width puts all four in one row.
  return (
    <div className="@container">
      <div className="grid @lg:grid-cols-2 @6xl:grid-cols-4">
        {section(GROUPS[0])}
        {section(GROUPS[1])}
        {children && <div className="flex flex-col">{children}</div>}
        <div className="flex flex-col">
          {section(GROUPS[2])}
          {trailing}
        </div>
      </div>
    </div>
  );
}
