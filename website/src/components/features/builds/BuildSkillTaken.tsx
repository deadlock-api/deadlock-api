import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { useHeroSkillPath } from "~/components/domain/graph/HeroSkillOrder";
import { BuildSectionError } from "~/components/features/builds/BuildSectionError";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { InlineStat } from "~/components/ui/inline-stat";
import { Skeleton } from "~/components/ui/skeleton";
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
  stepsHint,
  filters,
  active,
}: {
  heroId: number;
  build: BuildRow;
  /** How many points the build's written order has: the loading grid's length. */
  stepsHint: number;
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
      minDurationS: filters.minDurationS,
      maxDurationS: filters.maxDurationS,
      minMatches: MIN_ORDER_MATCHES,
    },
    build.matches,
    active,
    true,
  );
  if (orderQuery.isError) {
    return (
      <BuildSectionError
        title="Most taken skill order"
        what="the skill order"
        onRetry={() => void orderQuery.refetch()}
        retrying={orderQuery.isFetching}
      />
    );
  }
  // The section stays when there is no path, so the panel keeps its frame after the skeleton.
  const empty = !orderQuery.isPending && (!path || slotAbilities.length === 0);

  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title="Most taken skill order" />
      <div className="flex flex-col gap-2 px-3 py-1.5">
        {empty ? (
          <EmptyState variant="plain" title={`No skill order taken in ${MIN_ORDER_MATCHES}+ matches`} />
        ) : !path && slotAbilities.length > 0 && stepsHint > 0 ? (
          // The final shape while it loads: the stat line, and the grid's empty cells at the length the build's
          // written order suggests, so the grid lands in place.
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <AbilityOrderGrid
              size="sm"
              abilityIds={slotAbilities}
              steps={Array.from({ length: stepsHint }, () => ({ abilityId: -1 }))}
            />
          </div>
        ) : !path ? (
          <LoadingState variant="skeleton" label="skill order" />
        ) : (
          <StaleOverlay active={orderQuery.isPlaceholderData} label="skill order" className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <InlineStat value={formatPercent(path.share, 0)} label="of its matches" />
              <InlineStat value={formatPercent(path.winRate)} label="win rate" />
            </div>
            <AbilityOrderGrid size="sm" abilityIds={slotAbilities} steps={path.steps} />
          </StaleOverlay>
        )}
      </div>
    </section>
  );
}
