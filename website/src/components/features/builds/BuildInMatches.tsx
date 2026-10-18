import { Activity, ListOrdered, ShoppingBag, Swords } from "lucide-react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { useBuildItemUsage, useEndOfMatchDistributions, useSkillOrder } from "~/components/features/builds/build-hooks";
import { BuildByDuration } from "~/components/features/builds/BuildByDuration";
import { BuildByRank } from "~/components/features/builds/BuildByRank";
import { BuildItemTile } from "~/components/features/builds/BuildItemTile";
import { BuildMatchups } from "~/components/features/builds/BuildMatchups";
import { BuildPlaystyle } from "~/components/features/builds/BuildPlaystyle";
import { BuildSkillAdherence } from "~/components/features/builds/BuildSkillAdherence";
import { BuildSkillTaken } from "~/components/features/builds/BuildSkillTaken";
import { BuildSoulsByTime } from "~/components/features/builds/BuildSoulsByTime";
import { BuildTopPlayers } from "~/components/features/builds/BuildTopPlayers";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import type { BuildPerformanceTotals } from "~/lib/build-performance";
import type { BuildRow } from "~/lib/build-stats";
import { formatPercent, formatShare, formatSignedPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { winRateNoise } from "~/lib/wilson";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";

/** An item joins the purchase order when at least this share of the build's matches bought it. */
const BUY_ORDER_MIN_RATE = 0.5;

/** A key item is bought in at least this share of the build's matches and skipped in as many. */
const KEY_ITEM_MIN_RATE = 0.15;
const KEY_ITEMS_SHOWN = 5;
/** Where a key item's bar reaches its edge: fifteen points either way. */
const KEY_ITEM_SCALE = 0.15;

/** The most items the "Also bought" row shows. */
const OFF_BUILD_SHOWN = 12;

/**
 * What the selected build's players do in their matches, in four panels side by side: what they buy and when, how
 * they play against the hero's average build, how they keep to the skill order and fare by match length, and whom
 * they beat and who plays it most.
 */
export function BuildInMatches({
  heroId,
  row,
  filters,
  active,
  performance,
  averagePerformance,
  performancePending,
}: {
  heroId: number;
  row: BuildRow;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active: boolean;
  performance: BuildPerformanceTotals | undefined;
  averagePerformance: BuildPerformanceTotals | null;
  performancePending: boolean;
}) {
  const { usage, pending } = useBuildItemUsage({ heroId, row, filters, active });
  const { slotAbilities, skillOrder } = useSkillOrder(heroId, row);
  const distributions = useEndOfMatchDistributions({ heroId, buildId: row.hero_build_id, filters, active });
  // The items most of the build's players buy, listed or not, by when they buy them on average.
  const buyOrder = usage
    ? [...usage.byItem.values()]
        .filter((item) => item.boughtRate >= BUY_ORDER_MIN_RATE)
        .sort((a, b) => a.avgBuyTimeS - b.avgBuyTimeS)
    : [];
  // The items whose purchase splits the build's matches into ones that win more and ones that win less: bought in
  // enough and skipped in enough matches to compare, the biggest difference first.
  const keyItems = usage
    ? [...usage.byItem.values()]
        .filter(
          (item) =>
            item.winRateWithout !== null &&
            item.boughtRate >= KEY_ITEM_MIN_RATE &&
            item.boughtRate <= 1 - KEY_ITEM_MIN_RATE,
        )
        .sort((a, b) => b.winRate - b.winRateWithout! - (a.winRate - a.winRateWithout!))
        .slice(0, KEY_ITEMS_SHOWN)
    : [];
  const name = row.meta?.name ?? `Build ${row.hero_build_id}`;

  return (
    <Section title={`${name} in matches`} size="sm" className="gap-2">
      {/* Playstyle first: a row of its own while three panels fit beside each other, two columns of five when all do. */}
      <div className="grid gap-3 @4xl:grid-cols-3 @8xl:grid-cols-5">
        <Panel className="flex flex-col @4xl:col-span-3 @8xl:col-span-2">
          <PanelHeader title="Playstyle vs. average build" icon={Activity} size="sm" />
          <BuildPlaystyle
            totals={performance}
            average={averagePerformance}
            pending={performancePending}
            distributions={distributions}
          >
            <BuildSoulsByTime heroId={heroId} buildId={row.hero_build_id} filters={filters} active={active} />
          </BuildPlaystyle>
        </Panel>
        <Panel className="flex flex-col">
          <PanelHeader title="Purchases" icon={ShoppingBag} size="sm" />
          {pending ? (
            <LoadingState variant="skeleton" size="sm" />
          ) : !usage ? (
            <EmptyState variant="plain" title="No purchases" />
          ) : (
            <>
              <section className="flex flex-col">
                <PanelSection variant="label" title="Bought in this order">
                  <span className="tabular-nums">{buyOrder.length}</span>
                </PanelSection>
                <ol className="flex flex-wrap gap-1 px-3 py-1.5">
                  {buyOrder.map((item) => (
                    <li key={item.itemId}>
                      <BuildItemTile itemId={item.itemId} usage={item} pending={false} caption="time" />
                    </li>
                  ))}
                </ol>
              </section>
              {keyItems.length > 0 && (
                <section className="flex flex-col">
                  <PanelSection variant="label" title="Key items" />
                  <RankedEntityList density="compact" columns="single" className="px-3">
                    {keyItems.map((item, index) => {
                      const change = item.winRate - item.winRateWithout!;
                      const bought = Math.round(item.boughtRate * row.matches);
                      return (
                        <RankedEntityRow
                          key={item.itemId}
                          rank={index + 1}
                          entity={{ itemId: item.itemId }}
                          meta={`Bought in ${formatShare(item.boughtRate)}`}
                        >
                          <RankedEntityMetric
                            label="Bought"
                            labelDisplay={index === 0 ? "visible" : "hidden"}
                            value={formatPercent(item.winRate)}
                          />
                          <RankedEntityMetric
                            label="Without"
                            labelDisplay={index === 0 ? "visible" : "hidden"}
                            // Below 24rem the item names need its room; the difference column still tells it.
                            className="hidden @sm:flex"
                            value={formatPercent(item.winRateWithout!)}
                          />
                          <RankedEntityMetric
                            label="Diff"
                            labelDisplay="hidden"
                            value={formatSignedPercent(change)}
                            tone={
                              Math.abs(change) < winRateNoise(bought, row.matches - bought)
                                ? "muted"
                                : toneOf(Math.round(change * 1000))
                            }
                            change={{ value: change, scale: KEY_ITEM_SCALE }}
                          />
                        </RankedEntityRow>
                      );
                    })}
                  </RankedEntityList>
                </section>
              )}
              {usage.offBuild.length > 0 && (
                <section className="flex flex-col">
                  <PanelSection variant="label" title="Also bought" />
                  <ul className="flex flex-wrap gap-1 px-3 py-1.5">
                    {usage.offBuild.slice(0, OFF_BUILD_SHOWN).map((item) => (
                      <li key={item.itemId}>
                        <BuildItemTile itemId={item.itemId} usage={item} pending={false} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </Panel>
        <Panel className="flex flex-col">
          <PanelHeader title="Skill order and players" icon={ListOrdered} size="sm" />
          {skillOrder.length > 0 && slotAbilities.length > 0 && (
            <section className="flex flex-col">
              <PanelSection variant="label" title="Skill order followed" />
              <div className="px-3 py-1.5">
                <BuildSkillAdherence
                  heroId={heroId}
                  row={row}
                  skillOrder={skillOrder}
                  filters={filters}
                  active={active}
                />
              </div>
            </section>
          )}
          <BuildSkillTaken heroId={heroId} build={row} filters={filters} active={active} />
          <BuildTopPlayers heroId={heroId} buildId={row.hero_build_id} filters={filters} active={active} />
        </Panel>
        <Panel className="flex flex-col">
          <PanelHeader title="Where it wins" icon={Swords} size="sm" />
          <BuildMatchups heroId={heroId} build={row} filters={filters} active={active} />
          <BuildByDuration heroId={heroId} build={row} filters={filters} active={active} />
          <BuildByRank heroId={heroId} build={row} filters={filters} active={active} />
        </Panel>
      </div>
    </Section>
  );
}
