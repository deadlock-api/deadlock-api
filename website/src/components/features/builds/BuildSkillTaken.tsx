import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { useHeroSkillPath } from "~/components/domain/graph/HeroSkillOrder";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { InlineStat } from "~/components/ui/inline-stat";
import type { BuildRow } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";

/** A skill order needs this many of the build's matches behind it to count. */
const MIN_ORDER_MATCHES = 5;

/**
 * The skill order the build's players most often really take, step by step with how many took each upgrade next: the
 * build's own order is a suggestion, this is what its players do.
 */
export function BuildSkillTaken({
  heroId,
  build,
  filters,
  active,
}: {
  heroId: number;
  build: BuildRow;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active: boolean;
}) {
  const { orderQuery, slotAbilities, path } = useHeroSkillPath(
    heroId,
    {
      heroBuildId: build.hero_build_id,
      matchMode: filters.matchMode,
      minAverageBadge: filters.minAverageBadge,
      maxAverageBadge: filters.maxAverageBadge,
      minUnixTimestamp: filters.minUnixTimestamp,
      maxUnixTimestamp: filters.maxUnixTimestamp,
      minMatches: MIN_ORDER_MATCHES,
    },
    build.matches,
    active,
  );
  if (orderQuery.isError) return null;
  if (!orderQuery.isPending && (!path || slotAbilities.length === 0)) return null;

  return (
    <section className="flex flex-col">
      <PanelSection title="Most taken skill order" />
      <div className="flex flex-col gap-2 px-3 py-1.5">
        {!path ? (
          <LoadingState variant="skeleton" label="skill order" />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <InlineStat value={formatPercent(path.share, 0)} label="of its matches" />
              <InlineStat value={formatPercent(path.winRate)} label="win rate" />
            </div>
            <AbilityOrderGrid size="sm" abilityIds={slotAbilities} steps={path.steps} />
          </>
        )}
      </div>
    </section>
  );
}
