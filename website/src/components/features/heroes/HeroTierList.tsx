import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { TierGroup, TierItem, TierList, TierListHead, TierRow } from "~/components/patterns/tier-list/TierList";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { heroSlug } from "~/lib/hero-slug";
import { rankHeroes, type RankedHero, TIERS } from "~/lib/hero-tiers";
import { heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";
import { heroTierInputsQueryOptions } from "~/queries/hero-tier-query";

function HeroTile({ hero, ranked, banRate }: { hero: SlimHero; ranked: RankedHero; banRate?: number }) {
  return (
    <Tooltip
      content={
        <>
          <TooltipHeader
            leading={<HeroImage hero={hero} shape="rounded" title="" className="size-8" />}
            title={hero.name}
            subtitle={`${ranked.tier.toUpperCase()} tier${hero.hero_type ? ` · ${capitalize(hero.hero_type)}` : ""}`}
          />
          <TooltipStats>
            <TooltipStat label="Win rate" value={formatPercent(ranked.winRate)} />
            <TooltipStat label="Pick rate" value={formatPercent(ranked.pickRate)} />
            {banRate != null && <TooltipStat label="Ban rate" value={formatPercent(banRate)} />}
            <TooltipStat label="Matches" value={ranked.matches.toLocaleString("en-US")} />
            <TooltipStat label="Tier score" value={ranked.score.toFixed(2)} />
          </TooltipStats>
        </>
      }
    >
      <TierItem
        asChild
        name={hero.name}
        media={<HeroImage hero={hero} shape="rounded" title="" className="size-10" />}
        meta={
          <>
            {formatPercent(ranked.winRate)}
            <span className="sr-only"> win rate</span>
          </>
        }
      >
        <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(hero.name) }} preload="intent" />
      </TierItem>
    </Tooltip>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Every hero in S to D by the Overall table's tier score, under the hero filters. `groupByType` splits each tier by
 * the hero type the game assigns (the assets' `hero_type`), as the Overall table's switch of the same name does.
 */
export function HeroTierList({
  groupByType = false,
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
  matchMode,
}: {
  groupByType?: boolean;
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
  const range = { minUnixTimestamp: minUnixTimestamp ?? 0, maxUnixTimestamp };
  const ranks = { minAverageBadge: minRankId, maxAverageBadge: maxRankId };

  // Stats and bans as one value, so a filter change re-ranks once (see heroTierInputsQueryOptions). Their parts share
  // the Overall table's cache entries, so switching between the two views fetches nothing.
  const supportsBans = gameMode !== "street_brawl";
  const queryClient = useQueryClient();
  const inputsQuery = useQuery({
    ...heroTierInputsQueryOptions(
      queryClient,
      { minHeroMatches, minHeroMatchesTotal, ...ranks, ...range, gameMode, matchMode },
      supportsBans ? { ...ranks, ...range, matchMode } : null,
    ),
    placeholderData: keepPreviousData,
  });
  const heroesQuery = useQuery(heroesQueryOptions);

  const banData = inputsQuery.data?.bans;
  const banRates = useMemo(() => (banData ? computeBanRates(banData) : undefined), [banData]);
  const ranked = useMemo(
    () =>
      rankHeroes(
        (inputsQuery.data?.stats ?? []).map((row) => ({ heroId: row.hero_id, wins: row.wins, matches: row.matches })),
        getPickrateMultiplier(gameMode),
        banRates,
      ),
    [inputsQuery.data, banRates, gameMode],
  );
  const heroById = useMemo(() => new Map((heroesQuery.data ?? []).map((hero) => [hero.id, hero])), [heroesQuery.data]);

  if (inputsQuery.isError || heroesQuery.isError) {
    return (
      <ErrorState
        title="Failed to load the tier list"
        description={(inputsQuery.error ?? heroesQuery.error)?.message}
        onRetry={() => {
          void inputsQuery.refetch();
          void heroesQuery.refetch();
        }}
        retrying={inputsQuery.isFetching || heroesQuery.isFetching}
      />
    );
  }
  if (inputsQuery.isPending || heroesQuery.isPending) return <LoadingState label="hero tier list" align="center" />;

  const shown = ranked.filter((entry) => heroById.has(entry.heroId));
  if (shown.length === 0) return <EmptyState title="No heroes match these filters" />;

  // Hero types come from the assets, so a type the game adds shows up without a change here.
  const types = groupByType
    ? [...new Set(shown.map((entry) => heroById.get(entry.heroId)?.hero_type).filter((type) => type != null))]
        .sort()
        .slice(0, 4)
    : [];
  const columnCount = Math.min(4, Math.max(2, types.length)) as 2 | 3 | 4;
  const tile = (entry: RankedHero) => (
    <HeroTile
      key={entry.heroId}
      hero={heroById.get(entry.heroId)!}
      ranked={entry}
      banRate={banRates?.get(entry.heroId)}
    />
  );
  const scoreParts = banData ? "60% win rate, 25% pick rate and 15% ban rate" : "71% win rate and 29% pick rate";

  return (
    <Stack gap={2}>
      <StaleOverlay active={inputsQuery.isPlaceholderData} label="hero tier list">
        <TierList aria-label={groupByType ? "Hero tier list by hero type" : "Hero tier list"}>
          {types.length > 0 && (
            <TierListHead columns={columnCount}>
              {types.map((type) => (
                <span key={type}>{capitalize(type)}</span>
              ))}
            </TierListHead>
          )}
          {TIERS.map((tier) => {
            const inTier = shown.filter((entry) => entry.tier === tier);
            if (types.length === 0) {
              return (
                <TierRow key={tier} tier={tier} labelAs="h3">
                  {inTier.map(tile)}
                </TierRow>
              );
            }
            return (
              <TierRow key={tier} tier={tier} labelAs="h3" columns={columnCount}>
                {types.map((type) => (
                  <TierGroup key={type} label={capitalize(type)}>
                    {inTier.filter((entry) => heroById.get(entry.heroId)?.hero_type === type).map(tile)}
                  </TierGroup>
                ))}
              </TierRow>
            );
          })}
        </TierList>
      </StaleOverlay>
      <Text as="p" variant="caption" tone="muted">
        Sorted by tier score: {scoreParts}, each measured against the average hero. Within a tier, the highest score
        comes first.
      </Text>
    </Stack>
  );
}
