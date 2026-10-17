import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows, Hammer, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { BuildCompareDialog } from "~/components/features/builds/BuildCompareDialog";
import { BuildItemTile } from "~/components/features/builds/BuildItemTile";
import { BuildPlaystyle } from "~/components/features/builds/BuildPlaystyle";
import { BuildSkillAdherence } from "~/components/features/builds/BuildSkillAdherence";
import { BuildTopPlayers } from "~/components/features/builds/BuildTopPlayers";
import { Panel, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { Delta } from "~/components/ui/delta";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Skeleton } from "~/components/ui/skeleton";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { BUILD_METRICS, type BuildPerformanceTotals, metricDelta, nearestBadge } from "~/lib/build-performance";
import {
  buildItemIds,
  buildItemUsage,
  type BuildRow,
  type BuildTrend,
  buildCategoryName,
  buildLanguageName,
} from "~/lib/build-stats";
import { formatPercent, formatShare } from "~/lib/format";
import { badgeLabel } from "~/lib/rank-utils";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";
import { type BuildPurchaseFilters, buildItemPurchasesQueryOptions } from "~/queries/hero-build-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";
import type { SteamProfile } from "~/queries/steam-queries";

/** An item joins the purchase order when at least this share of the build's matches bought it. */
const BUY_ORDER_MIN_RATE = 0.5;

/** The most items the "Also bought" row shows. */
const OFF_BUILD_SHOWN = 8;

const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

/** The hero's four abilities in slot order: the rows of a skill order grid. */
function useSlotAbilities(heroId: number): number[] {
  const { data: hero } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => heroes.find((candidate) => candidate.id === heroId),
  });
  const { data: abilities } = useQuery(abilitiesQueryOptions);
  if (!hero || !abilities) return [];
  return HERO_ABILITY_SLOTS.flatMap((slot) => {
    const ability = abilities.find((candidate) => candidate.class_name === hero.items?.[slot]);
    return ability ? [ability.id] : [];
  });
}

const KDA_METRIC = BUILD_METRICS.find((metric) => metric.key === "kda")!;

/** The rank the build's players have on average, as a badge, against the hero's average build. */
function BuildRankStat({
  totals,
  average,
  pending,
}: {
  totals: BuildPerformanceTotals | undefined;
  average: BuildPerformanceTotals | null;
  pending: boolean;
}) {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const badge = totals ? nearestBadge(totals.avg_average_badge) : null;
  const averageBadge = average ? nearestBadge(average.avg_average_badge) : null;
  return (
    <Stat
      label="Avg. rank"
      value={
        badge !== null && ranks ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BadgeImage badge={badge} ranks={ranks} size="inline" />
            <span className="truncate">{badgeLabel(ranks, badge)}</span>
          </span>
        ) : pending ? (
          <Skeleton className="h-6 w-24" />
        ) : null
      }
      sub={averageBadge !== null && ranks && `Hero avg. ${badgeLabel(ranks, averageBadge)}`}
    />
  );
}

/** A category's name, and what its author wrote about it behind an info mark. */
function CategoryTitle({ name, description }: { name: string; description: string | null }) {
  if (!description) return name;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="truncate">{name}</span>
      <Tooltip content={description}>
        <TooltipTarget aria-label={`About ${name}`} className="inline-flex shrink-0 items-center">
          <Info aria-hidden="true" className="size-3.5" />
        </TooltipTarget>
      </Tooltip>
    </span>
  );
}

/** One build in full: who made it, how it did, the items of each of its categories and its skill order. */
export function BuildDetailPanel({
  row,
  rows,
  performanceById,
  authorBuilds,
  onBuildIdChange,
  performance,
  averagePerformance,
  performancePending,
  purchaseFilters,
  trend,
  heroId,
  profile,
  pending,
  profilePending,
  className,
}: {
  row: BuildRow;
  /** Every listed build, to compare this one with. */
  rows: readonly BuildRow[];
  /** Every listed build's performance totals, by id. */
  performanceById: Readonly<Record<number, BuildPerformanceTotals>> | undefined;
  /** The author's other listed builds for this hero. */
  authorBuilds: readonly BuildRow[];
  onBuildIdChange: (buildId: number) => void;
  /** The build's performance totals; undefined while they load or when they failed. */
  performance: BuildPerformanceTotals | undefined;
  /** Every listed build's totals pooled: the hero's average build. */
  averagePerformance: BuildPerformanceTotals | null;
  performancePending: boolean;
  /** The page's match filters, for the purchases of the build's players. */
  purchaseFilters: BuildPurchaseFilters;
  /** The build's share in the range's last days; undefined while it loads or without recent matches. */
  trend: BuildTrend | undefined;
  heroId: number;
  profile: SteamProfile | undefined;
  /** Build contents are still loading. */
  pending: boolean;
  profilePending: boolean;
  className?: string;
}) {
  const slotAbilities = useSlotAbilities(heroId);
  const [comparing, setComparing] = useState(false);
  const { meta } = row;
  const purchasesQuery = useQuery({
    ...buildItemPurchasesQueryOptions(row.hero_build_id, purchaseFilters, heroId),
    enabled: meta != null,
  });
  const purchases = purchasesQuery.data;
  const usage = useMemo(
    () => (purchases && meta ? buildItemUsage(purchases, row.matches, buildItemIds(meta)) : undefined),
    [purchases, meta, row.matches],
  );
  // The items most of the build's players buy, listed or not, by when they buy them on average.
  const buyOrder = usage
    ? [...usage.byItem.values()]
        .filter((item) => item.boughtRate >= BUY_ORDER_MIN_RATE)
        .sort((a, b) => a.avgBuyTimeS - b.avgBuyTimeS)
    : [];
  // A failed request leaves the items without their rates rather than holding skeletons.
  const purchasesPending = purchasesQuery.isPending && purchasesQuery.fetchStatus !== "idle";
  const name = meta?.name ?? `Build ${row.hero_build_id}`;
  const kda = performance ? KDA_METRIC.value(performance) : null;
  const averageKda = averagePerformance ? KDA_METRIC.value(averagePerformance) : null;
  // Ability ids the hero no longer has (reworked since the build was saved) are left out.
  const skillOrder = meta?.abilityOrder.filter((abilityId) => slotAbilities.includes(abilityId)) ?? [];

  return (
    <Panel className={cn("flex h-120 flex-col", className)}>
      <PanelHeader title={name} icon={Hammer} size="sm">
        {rows.length > 1 && (
          <Tooltip content="Compare with another build">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Compare with another build"
              className="ms-auto"
              onClick={() => setComparing(true)}
            >
              <GitCompareArrows aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
        <CopyButton
          text={String(row.hero_build_id)}
          variant="ghost"
          size="xs"
          aria-label={`Copy build ID ${row.hero_build_id}`}
          className={rows.length > 1 ? undefined : "ms-auto"}
        >
          <span className="tabular-nums">ID {row.hero_build_id}</span>
        </CopyButton>
      </PanelHeader>
      <div className={cn(SCROLLBAR_THIN, "@container relative flex min-h-0 flex-1 flex-col overflow-y-auto")}>
        <div className="flex flex-col gap-3 px-4 py-3">
          {meta ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <PlayerCell
                size="sm"
                accountId={meta.authorId}
                name={profile?.personaname}
                avatar={profile?.avatar}
                loading={profilePending && !profile}
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                v{meta.version} · {day.unix(meta.updatedAt).utc().format("MMM D, YYYY")}
                {meta.language !== 0 && ` · ${buildLanguageName(meta.language)}`}
              </span>
            </div>
          ) : null}
          <StatGroup size="xs" variant="joined" className="grid-cols-2 @lg:grid-cols-4">
            <Stat label="Matches" value={row.matches.toLocaleString("en-US")} sub={`${formatShare(row.share)} share`} />
            <Stat
              label="Players"
              value={row.players.toLocaleString("en-US")}
              sub={`${(row.matches / Math.max(1, row.players)).toFixed(1)} games each`}
            />
            <Stat
              label="Win rate"
              value={formatPercent(row.winRate)}
              sub={
                <>
                  {/* Colored only when the whole interval is on one side of the average. */}
                  <Delta value={row.vsAverage} polarity={row.verdict === "even" ? "neutral" : "higher-is-better"} /> vs.
                  avg
                </>
              }
            />
            <Stat
              label="Last 7 days"
              value={trend ? formatShare(trend.recentShare) : null}
              sub={trend && <Delta value={trend.change} unit=" pp" polarity="neutral" sign="arrow" />}
            />
            <BuildRankStat totals={performance} average={averagePerformance} pending={performancePending} />
            <Stat
              label="KDA"
              value={
                kda !== null ? KDA_METRIC.format(kda) : performancePending ? <Skeleton className="h-6 w-12" /> : null
              }
              sub={
                kda !== null && (
                  <>
                    <Delta value={metricDelta(KDA_METRIC, kda, averageKda)} /> vs. avg
                  </>
                )
              }
            />
          </StatGroup>
        </div>
        {meta ? (
          <>
            {meta.categories
              .filter((category) => category.itemIds.length > 0)
              .map((category) => (
                <section key={`${category.name}|${category.itemIds.join()}`} className="flex flex-col">
                  <PanelSection
                    title={
                      <CategoryTitle
                        name={buildCategoryName(category.name) ?? "Items"}
                        description={category.description}
                      />
                    }
                  >
                    <span className="tabular-nums">{category.itemIds.length}</span>
                  </PanelSection>
                  <ul className="flex flex-wrap gap-1.5 px-4 py-2">
                    {category.itemIds.map((itemId) => (
                      <li key={itemId}>
                        <BuildItemTile
                          itemId={itemId}
                          usage={usage?.byItem.get(itemId)}
                          pending={purchasesPending}
                          note={category.notes[itemId]}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            {buyOrder.length >= 3 && (
              <section className="flex flex-col">
                <PanelSection title="Bought in this order">
                  <span className="tabular-nums">{buyOrder.length}</span>
                </PanelSection>
                <ol className="flex flex-wrap gap-1.5 px-4 py-2">
                  {buyOrder.map((item) => (
                    <li key={item.itemId}>
                      <BuildItemTile itemId={item.itemId} usage={item} pending={false} caption="time" />
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {usage && usage.offBuild.length > 0 && (
              <section className="flex flex-col">
                <PanelSection title="Also bought" />
                <ul className="flex flex-wrap gap-1.5 px-4 py-2">
                  {usage.offBuild.slice(0, OFF_BUILD_SHOWN).map((item) => (
                    <li key={item.itemId}>
                      <BuildItemTile itemId={item.itemId} usage={item} pending={false} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {skillOrder.length > 0 && slotAbilities.length > 0 && (
              <section className="flex flex-col">
                <PanelSection title="Skill order" />
                <div className="flex flex-col gap-3 px-4 py-2">
                  <AbilityOrderGrid
                    size="sm"
                    abilityIds={slotAbilities}
                    steps={skillOrder.map((abilityId) => ({ abilityId }))}
                  />
                  <BuildSkillAdherence heroId={heroId} row={row} skillOrder={skillOrder} filters={purchaseFilters} />
                </div>
              </section>
            )}
            <BuildPlaystyle totals={performance} average={averagePerformance} pending={performancePending} />
            <BuildTopPlayers heroId={heroId} buildId={row.hero_build_id} filters={purchaseFilters} />
            {authorBuilds.length > 0 && (
              <section className="flex flex-col">
                <PanelSection title="More by this author" />
                <ul className="flex flex-col py-1">
                  {authorBuilds.map((build) => (
                    <li key={build.hero_build_id}>
                      <Button
                        variant="row"
                        className="flex items-center justify-between gap-3 px-4 py-1.5 text-xs"
                        onClick={() => onBuildIdChange(build.hero_build_id)}
                      >
                        <span className="min-w-0 truncate">{build.meta?.name ?? `Build ${build.hero_build_id}`}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {build.matches.toLocaleString("en-US")} · {formatPercent(build.winRate)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : pending ? (
          <LoadingState variant="skeleton" size="sm" />
        ) : (
          <EmptyState variant="plain" title="This build is no longer published" />
        )}
      </div>
      {comparing && (
        <BuildCompareDialog
          open={comparing}
          onOpenChange={setComparing}
          build={row}
          rows={rows}
          performance={performanceById}
        />
      )}
    </Panel>
  );
}
