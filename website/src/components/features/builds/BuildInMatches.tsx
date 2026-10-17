import { Activity, ListOrdered, ShoppingBag, Swords } from "lucide-react";

import { useBuildItemUsage, useSkillOrder } from "~/components/features/builds/build-hooks";
import { BuildByDuration } from "~/components/features/builds/BuildByDuration";
import { BuildItemTile } from "~/components/features/builds/BuildItemTile";
import { BuildMatchups } from "~/components/features/builds/BuildMatchups";
import { BuildPlaystyle } from "~/components/features/builds/BuildPlaystyle";
import { BuildSkillAdherence } from "~/components/features/builds/BuildSkillAdherence";
import { BuildTopPlayers } from "~/components/features/builds/BuildTopPlayers";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import type { BuildPerformanceTotals } from "~/lib/build-performance";
import type { BuildRow } from "~/lib/build-stats";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";

/** An item joins the purchase order when at least this share of the build's matches bought it. */
const BUY_ORDER_MIN_RATE = 0.5;

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
  // The items most of the build's players buy, listed or not, by when they buy them on average.
  const buyOrder = usage
    ? [...usage.byItem.values()]
        .filter((item) => item.boughtRate >= BUY_ORDER_MIN_RATE)
        .sort((a, b) => a.avgBuyTimeS - b.avgBuyTimeS)
    : [];
  const name = row.meta?.name ?? `Build ${row.hero_build_id}`;

  return (
    <Section title={`${name} in matches`} size="sm" className="gap-2">
      <div className="grid gap-3 @3xl:grid-cols-2 @7xl:grid-cols-4">
        <Panel className="flex flex-col">
          <PanelHeader title="Purchases" icon={ShoppingBag} size="sm" />
          {pending ? (
            <LoadingState variant="skeleton" size="sm" />
          ) : !usage ? (
            <EmptyState variant="plain" title="No purchases" />
          ) : (
            <>
              <section className="flex flex-col">
                <PanelSection title="Bought in this order">
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
              {usage.offBuild.length > 0 && (
                <section className="flex flex-col">
                  <PanelSection title="Also bought" />
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
          <PanelHeader title="Playstyle vs. average build" icon={Activity} size="sm" />
          <BuildPlaystyle totals={performance} average={averagePerformance} pending={performancePending} />
        </Panel>
        <Panel className="flex flex-col">
          <PanelHeader title="Skill order and match length" icon={ListOrdered} size="sm" />
          {skillOrder.length > 0 && slotAbilities.length > 0 && (
            <section className="flex flex-col">
              <PanelSection title="Skill order followed" />
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
          <BuildByDuration heroId={heroId} build={row} filters={filters} active={active} />
        </Panel>
        <Panel className="flex flex-col">
          <PanelHeader title="Matchups and players" icon={Swords} size="sm" />
          <BuildMatchups heroId={heroId} build={row} filters={filters} active={active} />
          <BuildTopPlayers heroId={heroId} buildId={row.hero_build_id} filters={filters} active={active} />
        </Panel>
      </div>
    </Section>
  );
}
