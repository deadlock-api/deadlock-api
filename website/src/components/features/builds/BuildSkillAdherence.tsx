import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Skeleton } from "~/components/ui/skeleton";
import { Stat, StatGroup } from "~/components/ui/stat";
import { buildAdherence, type BuildRow, buildUnlockOrder } from "~/lib/build-stats";
import { formatPercent, formatShare } from "~/lib/format";
import { type BuildPurchaseFilters, heroBuildStatsQueryOptions } from "~/queries/hero-build-stats-query";

/** The skill points a player must have spent as the build says to count as following its start. */
const FIRST_POINTS = 4;

/** One way of following the build's skill order: how many of its matches did, and how they and the rest won. */
function AdherenceStat({
  label,
  row,
  followed,
  pending,
}: {
  label: string;
  row: BuildRow;
  followed: { wins: number; matches: number } | undefined;
  pending: boolean;
}) {
  if (pending || !followed) {
    return <Stat label={label} value={pending ? <Skeleton className="h-5 w-12" /> : null} />;
  }
  const adherence = buildAdherence(row, followed);
  return (
    <Stat
      label={label}
      value={formatShare(adherence.share)}
      sub={
        adherence.winRate !== null && (
          <>
            {formatPercent(adherence.winRate)} wins
            {adherence.otherWinRate !== null && ` · ${formatPercent(adherence.otherWinRate)} without`}
          </>
        )
      }
    />
  );
}

/**
 * How closely the build's players kept to its skill order: the share of its matches that unlocked the abilities in the
 * build's order, and that spent the first points as it says, each with its win rate against the matches that did not.
 */
export function BuildSkillAdherence({
  heroId,
  row,
  skillOrder,
  filters,
  active = true,
}: {
  heroId: number;
  row: BuildRow;
  /** The build's skill order, ability ids by point. */
  skillOrder: readonly number[];
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active?: boolean;
}) {
  const unlockOrder = buildUnlockOrder(skillOrder);
  const firstPoints = skillOrder.slice(0, FIRST_POINTS);
  const base = {
    heroId,
    heroBuildId: row.hero_build_id,
    matchMode: filters.matchMode,
    minAverageBadge: filters.minAverageBadge,
    maxAverageBadge: filters.maxAverageBadge,
    minUnixTimestamp: filters.minUnixTimestamp,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    minMatches: 1,
  };
  const unlockQuery = useQuery({
    ...heroBuildStatsQueryOptions({ ...base, abilityUnlockOrderPrefix: unlockOrder }),
    enabled: active && unlockOrder.length >= 2,
    placeholderData: keepPreviousData,
  });
  const pointsQuery = useQuery({
    ...heroBuildStatsQueryOptions({ ...base, abilityOrderPrefix: firstPoints }),
    enabled: active && firstPoints.length === FIRST_POINTS,
    placeholderData: keepPreviousData,
  });
  // No row is an answer: none of the build's matches followed it.
  const followed = (data: { wins: number; matches: number }[] | undefined) =>
    data && (data[0] ?? { wins: 0, matches: 0 });

  return (
    <StaleOverlay active={unlockQuery.isPlaceholderData || pointsQuery.isPlaceholderData} label="skill order followed">
      <StatGroup size="xs" variant="joined" className="grid-cols-2">
        <AdherenceStat
          label="Same unlock order"
          row={row}
          followed={followed(unlockQuery.data)}
          pending={unlockQuery.isPending && unlockOrder.length >= 2}
        />
        <AdherenceStat
          label={`Same first ${FIRST_POINTS} points`}
          row={row}
          followed={followed(pointsQuery.data)}
          pending={pointsQuery.isPending && firstPoints.length === FIRST_POINTS}
        />
      </StatGroup>
    </StaleOverlay>
  );
}
