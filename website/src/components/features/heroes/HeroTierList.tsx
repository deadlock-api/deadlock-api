import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useMemo } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { TierEmpty, TierItem, TierList, TierRow, TierTile } from "~/components/patterns/tier-list/TierList";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TooltipHeader, TooltipStat, TooltipStats, Tooltip } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { heroSlug } from "~/lib/hero-slug";
import { computeHeroTiers, groupByTier, type HeroTierEntry, type Tier, TIER_THRESHOLDS } from "~/lib/hero-tiers";
import { heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

const TIER_DESCRIPTION: Record<Tier, string> = {
  S: "Best",
  A: "Strong",
  B: "Even",
  C: "Weak",
  D: "Worst",
};

function HeroTierTile({ entry, hero, pickRate }: { entry: HeroTierEntry; hero: SlimHero; pickRate: number }) {
  const name = hero.name ?? "Unknown Hero";
  return (
    <TierItem>
      <Tooltip
        content={
          <Stack gap={2}>
            <TooltipHeader title={name} subtitle={`${entry.tier} tier`} />
            <TooltipStats>
              <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
              <TooltipStat label="Adjusted win rate" value={formatPercent(entry.shrunkWinRate)} />
              <TooltipStat label="Pick rate" value={formatPercent(pickRate)} />
              <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
            </TooltipStats>
          </Stack>
        }
      >
        <TierTile asChild>
          <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(name) }} preload="intent">
            <HeroImage hero={hero} title="" aria-hidden="true" className="size-12 @md:size-14" />
            <span className="w-full text-2xs leading-tight font-medium break-words @md:text-xs">{name}</span>
            <span className="text-2xs text-muted-foreground tabular-nums">
              {formatPercent(entry.winRate)}
              <span className="sr-only"> win rate, {formatPercent(pickRate)} pick rate</span>
            </span>
          </Link>
        </TierTile>
      </Tooltip>
    </TierItem>
  );
}

function HowTiersAreComputed({ totalMatches, averageWinRate }: { totalMatches: number; averageWinRate: number }) {
  return (
    <Disclosure variant="bordered" size="sm" title="How tiers are computed" icon={<Info aria-hidden="true" />}>
      <Stack gap={2}>
        <Text as="p" variant="body" tone="muted">
          Tiers rank heroes by win rate alone, over {totalMatches.toLocaleString("en-US")} hero picks in the matches
          your filters select (average win rate {formatPercent(averageWinRate)}). Each hero&apos;s win rate is first
          pulled towards the average in proportion to how few matches it rests on (empirical Bayes shrinkage): a hero on
          a few hundred games cannot top the list on a lucky streak, while one on tens of thousands keeps its number.
          The adjusted win rate is in each hero&apos;s tooltip.
        </Text>
        <Text as="p" variant="body" tone="muted">
          Adjusted win rates are then compared with the real spread between heroes, the part of their differences that
          match-to-match luck cannot explain. S is {TIER_THRESHOLDS.S} spread or more above the average, A at least{" "}
          {TIER_THRESHOLDS.A} of a spread above, B within {TIER_THRESHOLDS.A} either side, C down to{" "}
          {Math.abs(TIER_THRESHOLDS.C)} spread below and D further down. Pick rate plays no part: a popular hero is not
          necessarily a strong one.
        </Text>
      </Stack>
    </Disclosure>
  );
}

export function HeroTierList({
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
  matchMode,
}: {
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  // The same parameters as the overall table, so the page loader's prefetch serves both.
  const statsQuery = useQuery({
    ...heroStatsQueryOptions({
      minHeroMatches,
      minHeroMatchesTotal,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      gameMode,
      matchMode,
    }),
    placeholderData: keepPreviousData,
  });
  const heroesQuery = useQuery(heroesQueryOptions);

  const heroesById = useMemo(
    () => new Map((heroesQuery.data ?? []).map((hero) => [hero.id, hero])),
    [heroesQuery.data],
  );
  const result = useMemo(
    () =>
      computeHeroTiers(
        (statsQuery.data ?? [])
          .filter((row) => heroesById.has(row.hero_id))
          .map((row) => ({ heroId: row.hero_id, wins: row.wins, matches: row.matches })),
      ),
    [statsQuery.data, heroesById],
  );

  if (statsQuery.isError || heroesQuery.isError) {
    return (
      <ErrorState
        title="Failed to load the tier list"
        description={(statsQuery.error ?? heroesQuery.error)?.message}
        onRetry={() => {
          if (statsQuery.isError) void statsQuery.refetch();
          if (heroesQuery.isError) void heroesQuery.refetch();
        }}
        retrying={statsQuery.isFetching || heroesQuery.isFetching}
      />
    );
  }
  if (!statsQuery.data || !heroesQuery.data) return <LoadingState label="hero tier list" align="center" />;
  if (result.entries.length === 0) {
    return (
      <EmptyState
        title="No heroes match these filters"
        description="Widen the rank range or the dates, or lower the minimum matches."
      />
    );
  }

  const pickrateMultiplier = getPickrateMultiplier(gameMode);
  return (
    <Stack gap={3}>
      <StaleOverlay active={statsQuery.isPlaceholderData} label="tier list">
        <TierList aria-label="Deadlock hero tier list">
          {groupByTier(result.entries).map(({ tier, entries }) => (
            <TierRow key={tier} tier={tier.toLowerCase() as Lowercase<Tier>} description={TIER_DESCRIPTION[tier]}>
              {entries.length === 0 ? (
                <TierEmpty>No hero in this tier</TierEmpty>
              ) : (
                entries.map((entry) => (
                  <HeroTierTile
                    key={entry.heroId}
                    entry={entry}
                    hero={heroesById.get(entry.heroId)!}
                    pickRate={entry.share * pickrateMultiplier}
                  />
                ))
              )}
            </TierRow>
          ))}
        </TierList>
      </StaleOverlay>
      <HowTiersAreComputed totalMatches={result.totalMatches} averageWinRate={result.averageWinRate} />
    </Stack>
  );
}
