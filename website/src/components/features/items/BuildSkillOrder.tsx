import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiAbilityOrderStatsRequest } from "deadlock_api_client";
import { RotateCcw, Sparkles } from "lucide-react";
import { useMemo } from "react";

import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { InlineStat } from "~/components/ui/inline-stat";
import { Skeleton } from "~/components/ui/skeleton";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions } from "~/queries/asset-queries";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * The build's skill order as an editor: it starts as the most common order of the build's players, a cell press makes
 * an upgrade that row's ability, and Reset goes back. A changed order shows how the players whose order starts with it
 * did (the API's order prefix filter, with the build's items).
 */
export function BuildSkillOrder({
  heroId,
  slotAbilities,
  order,
  common,
  request,
  commonStats,
  loading,
  onValueChange: onChange,
}: {
  heroId: number;
  /** The hero's four abilities in slot order: the grid's rows. */
  slotAbilities: readonly number[];
  /** The order shown: the reader's, or the common one. */
  order: readonly number[];
  /** The most common order and its share of players at each step, to compare with and to reset to. */
  common: readonly { abilityId: number; pickRate: number }[];
  /** How the players on the common order did, shown while the order is unchanged. */
  commonStats?: { winRate: number; matches: number } | null;
  /** The ability order filters of the build (items, ranks, dates). */
  request: Omit<AnalyticsApiAbilityOrderStatsRequest, "heroId">;
  loading: boolean;
  /** The reader's new order, or null to go back to the common one. */
  onValueChange: (order: number[] | null) => void;
}) {
  const custom = order.length > 0 && order.some((id, i) => id !== common[i]?.abilityId);
  const { data: abilities } = useQuery(abilitiesQueryOptions);
  const names = useMemo(
    () => slotAbilities.map((id) => abilities?.find((a) => a.id === id)?.name ?? "Ability"),
    [abilities, slotAbilities],
  );
  // The players whose order starts like the reader's up to its last change (a whole 12-step order is almost no one's):
  // every answered order extends that prefix, so they sum up.
  const lastChange = order.reduce((last, id, i) => (id !== common[i]?.abilityId ? i : last), -1);
  const { data: prefixed, isPending } = useQuery({
    ...abilityOrderQueryOptions({
      ...request,
      heroId,
      minMatches: 1,
      abilityOrderPrefix: order.slice(0, lastChange + 1),
    }),
    enabled: custom,
  });
  const stats = useMemo(() => {
    if (!prefixed) return null;
    const wins = prefixed.reduce((sum, row) => sum + row.wins, 0);
    const matches = prefixed.reduce((sum, row) => sum + row.matches, 0);
    return matches > 0 ? { winRate: wins / matches, matches } : { winRate: null, matches: 0 };
  }, [prefixed]);
  const steps = order.map((abilityId, i) => ({
    abilityId,
    // The common order's share where this step still follows it: the row stays, so an edit does not shrink the panel.
    pickRate: abilityId === common[i]?.abilityId ? common[i]?.pickRate : undefined,
  }));

  return (
    <Panel>
      <PanelHeader title={custom ? "Your skill order" : "Skill order · most common"} icon={Sparkles} size="sm">
        {custom && (
          <Button variant="ghost" size="xs" onClick={() => onChange(null)}>
            <RotateCcw />
            Reset
          </Button>
        )}
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        {loading ? (
          <LoadingState label="skill order" variant="skeleton" />
        ) : slotAbilities.length === 0 || order.length === 0 ? (
          <EmptyState variant="inline" title="Too few games share one skill order to show it" />
        ) : (
          <>
            <div className="flex min-h-5 flex-wrap gap-x-5 gap-y-1 text-sm">
              {custom ? (
                isPending ? (
                  <Skeleton className="h-5 w-48" />
                ) : stats && stats.matches > 0 && stats.winRate != null ? (
                  <>
                    <InlineStat value={percent(stats.winRate)} label="win rate" />
                    <InlineStat
                      value={stats.matches.toLocaleString("en-US")}
                      label={`games start like this to upgrade ${lastChange + 1}`}
                    />
                  </>
                ) : (
                  <InlineStat value="0" label="games start like this" />
                )
              ) : commonStats ? (
                <>
                  <InlineStat value={percent(commonStats.winRate)} label="win rate" />
                  <InlineStat value={commonStats.matches.toLocaleString("en-US")} label="games take it all" />
                </>
              ) : null}
            </div>
            <AbilityOrderGrid abilityIds={slotAbilities} abilityNames={names} steps={steps} onValueChange={onChange} />
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
