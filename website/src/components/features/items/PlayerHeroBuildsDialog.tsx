import { useQuery } from "@tanstack/react-query";
import type { MatchesApiBulkMetadataRequest, Rank, SteamProfile } from "deadlock_api_client";
import { useMemo, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import MatchHistoryCard from "~/components/domain/match/MatchHistoryCard";
import { SeasonPatchDatePicker } from "~/components/domain/selectors/SeasonPatchDatePicker";
import { AverageBuildCard } from "~/components/features/items/AverageBuildCard";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { SearchInput } from "~/components/ui/search-input";
import { Stack } from "~/components/ui/stack";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day, type Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { computeAverageBuild } from "~/lib/average-build";
import {
  type BulkMatchMetadata,
  buildComponentImplications,
  buildPlayerBuildCards,
  buildUpgradeChainLookup,
  getHeroAbilityMetadata,
} from "~/lib/build-transform";
import { PATCHES } from "~/lib/constants";
import { useDebouncedState } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

const RECENT_MATCH_LIMIT = 100;

export function PlayerHeroBuildsDialog({
  open,
  onOpenChange,
  accountId,
  playerName,
  heroId,
  minUnixTimestamp,
  maxUnixTimestamp,
  ranks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number | null;
  playerName?: string;
  heroId: number;
  /** Date range from the originating item-stats inspection — scopes the player's builds to match. */
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
  ranks?: Rank[];
}) {
  const { data: heroesData } = useQuery(heroesQueryOptions);
  const { data: abilityItems } = useQuery(abilitiesQueryOptions);
  const { data: assetsItems } = useQuery(itemUpgradesQueryOptions);

  // Lets the user pivot the dialog to a different player (same hero) without leaving it,
  // and widen/narrow the time window past the range it inherited from the item-stats page.
  // Reset both back to their originating values whenever the dialog is (re)opened or the source account changes.
  const inheritedRange = useMemo<{ startDate?: Dayjs; endDate?: Dayjs }>(
    () => ({
      startDate: minUnixTimestamp != null ? day.unix(minUnixTimestamp) : undefined,
      endDate: maxUnixTimestamp != null ? day.unix(maxUnixTimestamp) : undefined,
    }),
    [minUnixTimestamp, maxUnixTimestamp],
  );
  const [overridePlayer, setOverridePlayer] = useState<{ accountId: number; name?: string } | null>(null);
  const [dateRange, setDateRange] = useState<{ startDate?: Dayjs; endDate?: Dayjs }>(inheritedRange);
  const [sessionKey, setSessionKey] = useState(`${open}:${accountId}`);
  const currentKey = `${open}:${accountId}`;
  if (currentKey !== sessionKey) {
    setSessionKey(currentKey);
    setOverridePlayer(null);
    setDateRange(inheritedRange);
  }

  const effectiveAccountId = overridePlayer?.accountId ?? accountId;
  const effectiveName = overridePlayer?.name ?? playerName;
  const { minUnixTimestamp: queryMinTimestamp, maxUnixTimestamp: queryMaxTimestamp } = useNormalizedTimeRange(
    dateRange.startDate,
    dateRange.endDate,
  );

  const { data: matches, isLoading } = useQuery({
    queryKey: queryKeys.analytics.playerHeroBuilds(
      effectiveAccountId ?? 0,
      heroId,
      queryMinTimestamp,
      queryMaxTimestamp,
    ),
    queryFn: async () => {
      const request: MatchesApiBulkMetadataRequest = {
        includeInfo: true,
        includePlayerItems: true,
        includePlayerKda: true,
        includePlayerInfo: true,
        accountIds: effectiveAccountId != null ? [effectiveAccountId] : undefined,
        heroIds: String(heroId),
        minUnixTimestamp: queryMinTimestamp ?? undefined,
        maxUnixTimestamp: queryMaxTimestamp ?? undefined,
        // Exclude Street Brawl (and other non-standard modes) — their builds aren't comparable.
        gameMode: "normal",
        orderBy: "match_id",
        orderDirection: "desc",
        limit: RECENT_MATCH_LIMIT,
      };
      const response = await api.matches_api.bulkMetadata(request);
      return response.data as unknown as BulkMatchMetadata[];
    },
    enabled: open && effectiveAccountId != null,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });

  const cards = useMemo(() => {
    if (!matches || effectiveAccountId == null) return [];
    const heroData = heroesData?.find((h) => h.id === heroId);
    const heroAbilityMetadata = getHeroAbilityMetadata(heroData, abilityItems);
    const upgradeChainLookup = buildUpgradeChainLookup(assetsItems);
    return buildPlayerBuildCards(matches, heroId, heroAbilityMetadata, upgradeChainLookup, {
      accountId: effectiveAccountId,
    }).sort((a, b) => b.startTime.localeCompare(a.startTime));
  }, [matches, effectiveAccountId, heroId, heroesData, abilityItems, assetsItems]);

  const componentImplications = useMemo(() => buildComponentImplications(assetsItems), [assetsItems]);
  const costById = useMemo(() => buildUpgradeChainLookup(assetsItems)?.costById, [assetsItems]);
  const averageBuild = useMemo(
    () => computeAverageBuild(cards, componentImplications, costById),
    [cards, componentImplications, costById],
  );

  const wins = cards.filter((c) => c.result === "win").length;
  const losses = cards.length - wins;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <HeroImage heroId={heroId} shape="rounded" ring="border" className="size-7 shrink-0" />
            <span>{effectiveName ?? "Player"}</span>
            <span className="text-sm font-normal text-muted-foreground">(recent builds)</span>
            <PlayerSearch
              onSelect={(profile) => setOverridePlayer({ accountId: profile.account_id, name: profile.personaname })}
            />
            <SeasonPatchDatePicker
              patchDates={PATCHES}
              value={dateRange}
              onValueChange={({ startDate, endDate }) => setDateRange({ startDate, endDate })}
              defaultTab="custom"
            />
          </DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Loading recent matches…"
              : cards.length > 0
                ? `Last ${cards.length} matches on this hero · ${wins}W ${losses}L · ${Math.round((wins / cards.length) * 100)}% WR`
                : "No recent matches found for this player on this hero."}
          </DialogDescription>
        </DialogHeader>

        <Stack gap={3} className="min-h-0 flex-1 overflow-y-auto pe-1">
          {isLoading ? (
            <LoadingState label="recent matches" align="center" />
          ) : (
            <>
              {averageBuild && <AverageBuildCard build={averageBuild} heroId={heroId} />}
              {cards.map((card) => (
                <MatchHistoryCard key={card.matchId} {...card} ranks={ranks} expandable={false} />
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function PlayerSearch({ onSelect }: { onSelect: (profile: SteamProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [query, debouncedQuery, setQuery] = useDebouncedState("", 300);
  const trimmed = debouncedQuery.trim();

  const { data: results, isFetching } = useQuery({
    queryKey: queryKeys.steam.search(trimmed),
    queryFn: async () => {
      const response = await api.steam_api.steamSearch({ searchQuery: trimmed, limit: 10 });
      return response.data;
    },
    enabled: open && trimmed.length >= 2,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="subtle" size="xs" className="font-normal">
          <span className="icon-[mdi--magnify] size-3.5" />
          Search another player…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-2 p-2">
        <SearchInput
          aria-label="Search by Steam name"
          value={query}
          onValueChange={setQuery}
          placeholder="Search by Steam name…"
          size="sm"
        />
        <div className="max-h-64 overflow-y-auto">
          {trimmed.length < 2 ? (
            <EmptyState variant="inline" title="Type at least 2 characters to search." className="py-2 text-xs" />
          ) : isFetching ? (
            <LoadingState size="sm" text="Loading players…" label="players" className="py-2 text-xs" />
          ) : !results || results.length === 0 ? (
            <EmptyState variant="inline" title="No players found." className="py-2 text-xs" />
          ) : (
            <ul className="flex flex-col">
              {results.map((profile) => (
                <li key={profile.account_id}>
                  <OptionRow
                    selected={false}
                    onClick={() => {
                      onSelect(profile);
                      setOpen(false);
                      setQuery("");
                    }}
                    leading={
                      <Avatar size="sm">
                        <AvatarImage src={profile.avatarmedium} alt={profile.personaname} />
                        <AvatarFallback>{profile.personaname.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    }
                  >
                    {profile.personaname}
                  </OptionRow>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
