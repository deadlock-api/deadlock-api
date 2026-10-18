import { Activity, ListOrdered, ShoppingBag, Swords } from "lucide-react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { useBuildItemUsage, useEndOfMatchDistributions, useSkillOrder } from "~/components/features/builds/build-hooks";
import { BuildByDuration } from "~/components/features/builds/BuildByDuration";
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
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { InlineStat } from "~/components/ui/inline-stat";
import type { BuildPerformanceTotals } from "~/lib/build-performance";
import type { BuildRow } from "~/lib/build-stats";
import { formatPercent, formatShare, formatSignedPoints } from "~/lib/format";
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
 * What the selected build's players do in their matches: what they buy and when, how they keep to the skill order and
 * who plays it most, whom they beat, and last how they play against all of the hero's builds and fare by match length.
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
  const { usage, pending, stale } = useBuildItemUsage({ heroId, row, filters, active });
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
    <Section
      title={`${name} in matches`}
      // The build's name and numbers stay in view down its panels.
      header="sticky"
      className="gap-3 pt-3"
      description={
        // The build's own headline, so the panels below read against it without a look back up at the list.
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <InlineStat value={row.matches.toLocaleString("en-US")} label="matches" size="lg" />
          <InlineStat value={row.players.toLocaleString("en-US")} label="players" size="lg" />
          <InlineStat value={formatPercent(row.winRate)} label="win rate" size="lg" />
          <InlineStat
            value={formatSignedPoints(row.vsAverage)}
            label="vs. all builds"
            size="lg"
            tone={row.verdict === "above" ? "positive" : row.verdict === "below" ? "negative" : undefined}
          />
        </span>
      }
    >
      {/* What to buy, which skills to take and whom it beats come first: on a wide screen the purchases, the tallest,
          sit beside the skill order and the matchups stacked two columns wide; two abreast the purchases sit beside
          the matchups and the skill order, wide by nature, takes the row under them. The playstyle's thirty numbers,
          for a closer look, take the last row. */}
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        <Panel className="flex flex-col @4xl:row-span-2">
          <PanelHeader title="Purchases" icon={ShoppingBag} size="sm" />
          {pending ? (
            <LoadingState variant="skeleton" size="sm" />
          ) : !usage ? (
            <EmptyState variant="plain" title="No purchases" />
          ) : (
            <StaleOverlay active={stale} label="purchases">
              <section className="flex flex-col">
                <PanelSection variant="label" title="Bought in this order">
                  <span className="whitespace-nowrap">Average buy time</span>
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
                          meta={`${formatShare(item.boughtRate)} bought it`}
                        >
                          {/* The two rates step back: the gap between them is what a key item is read for. */}
                          <RankedEntityMetric
                            label="With it"
                            labelDisplay={index === 0 ? "visible" : "hidden"}
                            value={formatPercent(item.winRate)}
                            tone="muted"
                          />
                          <RankedEntityMetric
                            label="Without"
                            labelDisplay={index === 0 ? "visible" : "hidden"}
                            // Below 24rem the item names need its room; the difference column still tells it.
                            className="hidden @sm:flex"
                            value={formatPercent(item.winRateWithout!)}
                            tone="muted"
                          />
                          <RankedEntityMetric
                            label="Vs. without"
                            labelDisplay={index === 0 ? "visible" : "hidden"}
                            width="wide"
                            value={formatSignedPoints(change)}
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
                  <PanelSection variant="label" title="Also bought">
                    <span className="whitespace-nowrap">Bought in % of matches</span>
                  </PanelSection>
                  <ul className="flex flex-wrap gap-1 px-3 py-1.5">
                    {usage.offBuild.slice(0, OFF_BUILD_SHOWN).map((item) => (
                      <li key={item.itemId}>
                        <BuildItemTile itemId={item.itemId} usage={item} pending={false} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </StaleOverlay>
          )}
        </Panel>
        <Panel className="flex flex-col @2xl:order-1 @2xl:col-span-2 @4xl:order-none">
          <PanelHeader title="Skill order and players" icon={ListOrdered} size="sm" />
          {/* Across a whole row, the players sit beside the skill order instead of under it. */}
          <div className="@container">
            <div className="grid @2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="flex min-w-0 flex-col">
                {/* Also while the hero's abilities load (the written order is known), so the panel does not grow. */}
                {(row.meta?.abilityOrder.length ?? 0) > 0 && (slotAbilities.length === 0 || skillOrder.length > 0) && (
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
                <BuildSkillTaken
                  heroId={heroId}
                  build={row}
                  stepsHint={skillOrder.length}
                  filters={filters}
                  active={active}
                />
              </div>
              <BuildTopPlayers
                heroId={heroId}
                buildId={row.hero_build_id}
                playerCount={row.players}
                filters={filters}
                active={active}
              />
            </div>
          </div>
        </Panel>
        <Panel className="flex flex-col @4xl:col-span-2">
          <PanelHeader title="Matchups" icon={Swords} size="sm" />
          <BuildMatchups heroId={heroId} build={row} filters={filters} active={active} />
        </Panel>
        <Panel className="flex flex-col @2xl:order-2 @2xl:col-span-2 @4xl:col-span-3">
          <PanelHeader title="Playstyle vs. all builds" icon={Activity} size="sm" />
          <BuildPlaystyle
            totals={performance}
            average={averagePerformance}
            pending={performancePending}
            distributions={distributions}
            trailing={<BuildByDuration heroId={heroId} build={row} filters={filters} active={active} />}
          >
            <BuildSoulsByTime heroId={heroId} buildId={row.hero_build_id} filters={filters} active={active} />
          </BuildPlaystyle>
        </Panel>
      </div>
    </Section>
  );
}
