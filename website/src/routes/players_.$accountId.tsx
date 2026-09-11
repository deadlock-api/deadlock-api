import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import { QueryRenderer } from "~/components/QueryRenderer";
import { EnemiesTab, MatesTab } from "~/components/tracker-page/breakdown/PlayerStatsTable";
import { TrackerFilterBar } from "~/components/tracker-page/filters/TrackerFilterBar";
import { HeroesTab } from "~/components/tracker-page/heroes/HeroesTab";
import { MatchesTab } from "~/components/tracker-page/matches/MatchesTab";
import { OverviewSkeleton } from "~/components/tracker-page/overview/OverviewSkeleton";
import { OverviewTab } from "~/components/tracker-page/overview/OverviewTab";
import { FeedbackNoticeDialog } from "~/components/tracker-page/shared/FeedbackNoticeDialog";
import { PlayerHeader } from "~/components/tracker-page/shared/PlayerHeader";
import { TrackerEmptyState } from "~/components/tracker-page/shared/TrackerEmptyState";
import { TrackerGate } from "~/components/tracker-page/shared/TrackerGate";
import { TrackerQueryError } from "~/components/tracker-page/shared/TrackerQueryError";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useTrackerFilters } from "~/hooks/useTrackerFilters";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { parseSteamIdToId3 } from "~/lib/steam";
import { filterMatches, filtersRevealing, type TrackerFilterValues } from "~/lib/tracker/compute";
import { filterRecoveryOptions } from "~/lib/tracker/filter-recovery";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamProfileQueryOptions, trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

export const Route = createFileRoute("/players_/$accountId")({
  component: TrackerRoute,
  loader: async ({ context: { queryClient }, params }) => {
    const accountId = Number(parseSteamIdToId3(params.accountId.trim()));
    if (!Number.isInteger(accountId) || accountId <= 0 || accountId > 4294967295) throw notFound();
    // Canonicalize SteamID64 (or bracketed) URLs to the SteamID3 form.
    if (String(accountId) !== params.accountId) {
      throw redirect({ to: "/players/$accountId", params: { accountId: String(accountId) } });
    }
    const [profile] = await Promise.all([
      prefetchSafe(queryClient.ensureQueryData(steamProfileQueryOptions(accountId))),
      prefetchSafe(queryClient.ensureQueryData(heroesQueryOptions)),
      prefetchSafe(queryClient.ensureQueryData(ranksQueryOptions)),
    ]);
    return { accountId, personaname: profile?.personaname, breadcrumb: profile?.personaname ?? String(accountId) };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.personaname ?? (loaderData ? `Player ${loaderData.accountId}` : undefined);
    return seo({
      title: name ? `${name} | Player Tracker | Deadlock` : "Player Tracker | Deadlock",
      description: name
        ? `Full Deadlock match history, rank progression, hero breakdowns, and mate & opponent analytics for ${name}.`
        : "Full Deadlock match history, rank progression, hero breakdowns, and mate & opponent analytics for prioritized players.",
      path: loaderData ? `/players/${loaderData.accountId}` : "/players",
    });
  },
});

function TrackerRoute() {
  const { accountId } = Route.useLoaderData();
  return (
    <TrackerGate accountId={accountId}>
      <TrackerContent accountId={accountId} />
    </TrackerGate>
  );
}

function TrackerContent({ accountId }: { accountId: number }) {
  const {
    tab,
    setTab,
    mode,
    setMode,
    gameMode,
    matchMode,
    heroId,
    setHeroId,
    result,
    setResult,
    startDate,
    endDate,
    handleDateChange,
    minUnixTimestamp,
    maxUnixTimestamp,
    filters,
  } = useTrackerFilters();

  const sectionRef = useRef<HTMLElement>(null);
  const previousSection = useRef(tab);
  useEffect(() => {
    if (previousSection.current === tab) return;
    previousSection.current = tab;
    sectionRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView({ block: "start" });
  }, [tab]);

  const [expandedMatchId, setExpandedMatchId] = useQueryState("match", parseAsInteger);
  const openMatch = (matchId: number) => {
    setExpandedMatchId(matchId);
    setTab("matches");
  };

  const historyQuery = useQuery(trackerMatchHistoryQueryOptions(accountId));
  const { data: ranks = [] } = useQuery(ranksQueryOptions);

  const filteredEntries = useMemo(() => filterMatches(historyQuery.data ?? [], filters), [historyQuery.data, filters]);
  const recoveries = useMemo(
    () => (filteredEntries.length === 0 ? filterRecoveryOptions(historyQuery.data ?? [], filters) : []),
    [historyQuery.data, filters, filteredEntries.length],
  );
  const latestBadge = useMemo(() => {
    let latestTime = -Infinity;
    let badge: number | null = null;
    for (const entry of historyQuery.data ?? []) {
      if (entry.start_time > latestTime && entry.ranked_display_badge != null && entry.ranked_display_badge > 0) {
        latestTime = entry.start_time;
        badge = entry.ranked_display_badge;
      }
    }
    return badge;
  }, [historyQuery.data]);
  // Form and streaks need both outcomes, even when the match list is filtered to wins or losses.
  const formEntries = useMemo(
    () =>
      filters.result === "all"
        ? filteredEntries
        : filterMatches(historyQuery.data ?? [], { ...filters, result: "all" }),
    [historyQuery.data, filters, filteredEntries],
  );

  const sessionContext = useMemo(
    () =>
      filters.heroId == null
        ? formEntries
        : filterMatches(historyQuery.data ?? [], { ...filters, heroId: null, result: "all" }),
    [historyQuery.data, filters, formEntries],
  );

  const linkedMatch = useMemo(() => {
    if (expandedMatchId == null) return null;
    return historyQuery.data?.find((entry) => entry.match_id === expandedMatchId) ?? null;
  }, [expandedMatchId, historyQuery.data]);
  const hiddenLinkedMatch =
    linkedMatch && !filteredEntries.some((entry) => entry.match_id === linkedMatch.match_id) ? linkedMatch : null;
  const revealingFilters = hiddenLinkedMatch ? filtersRevealing(hiddenLinkedMatch, filters) : null;
  // The matches tab opens on the page holding the linked match only when it mounts, so a reveal remounts it.
  const [revealCount, setRevealCount] = useState(0);
  useEffect(() => {
    // Recovery removes the focused button along with the old empty state or hidden-match notice.
    if (revealCount > 0) sectionRef.current?.focus({ preventScroll: true });
  }, [revealCount]);
  const widenFilters = (next: TrackerFilterValues) => {
    setMode(next.mode);
    setHeroId(next.heroId);
    setResult(next.result);
    if (next.minUnixTimestamp !== minUnixTimestamp || next.maxUnixTimestamp !== maxUnixTimestamp) {
      handleDateChange(undefined, undefined);
    }
    setRevealCount((count) => count + 1);
  };
  const revealLinkedMatch = () => {
    if (revealingFilters) widenFilters(revealingFilters);
  };

  return (
    <div className="flex flex-col gap-3">
      <FeedbackNoticeDialog />
      <PlayerHeader accountId={accountId} entries={historyQuery.data} ranks={ranks}>
        <TrackerFilterBar
          mode={mode}
          onModeChange={setMode}
          heroId={heroId}
          onHeroChange={setHeroId}
          result={result}
          onResultChange={setResult}
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
        />
      </PlayerHeader>

      {historyQuery.isError && (
        <TrackerQueryError
          title={historyQuery.data ? "Could not refresh match history" : "Could not load match history"}
          description={
            historyQuery.data
              ? "Showing your last loaded matches. New matches may be missing until the next successful refresh."
              : "Your match history is temporarily unavailable. Try loading it again."
          }
          onRetry={() => historyQuery.refetch()}
          isRetrying={historyQuery.isFetching}
        />
      )}

      {tab === "matches" && expandedMatchId != null && historyQuery.isSuccess && !linkedMatch && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>Linked match not found</AlertTitle>
          <AlertDescription className="gap-2">
            <p>Match #{expandedMatchId} isn't in this player's loaded history.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExpandedMatchId(null);
                sectionRef.current?.focus({ preventScroll: true });
              }}
            >
              Return to overview
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-label={
          tab === "matches" ? "Player overview" : tab === "heroes" ? "All hero stats" : "Teammate and opponent stats"
        }
        className="flex min-w-0 scroll-mt-4 flex-col gap-3 outline-none"
      >
        {tab !== "matches" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExpandedMatchId(null);
                setTab("matches", { history: "push" });
              }}
            >
              <ArrowLeft data-icon="inline-start" />
              Back to overview
            </Button>
            <h2 className="text-sm font-semibold">
              {tab === "heroes" ? "All Hero Stats" : "Teammate & Opponent Stats"}
            </h2>
          </div>
        )}
        {tab === "matches" && (
          <QueryRenderer
            query={historyQuery}
            loadingFallback={<OverviewSkeleton />}
            errorFallback={() => null}
            keepDataOnError
          >
            {(history) =>
              filteredEntries.length === 0 && !hiddenLinkedMatch ? (
                <TrackerEmptyState
                  hasHistory={history.length > 0}
                  recoveries={recoveries}
                  onRecover={(next) => {
                    widenFilters(next);
                    setExpandedMatchId(null);
                  }}
                />
              ) : (
                <MatchesTab
                  key={revealCount}
                  entries={filteredEntries}
                  sessionContext={sessionContext}
                  ranks={ranks}
                  accountId={accountId}
                  heroId={heroId}
                  onHeroChange={setHeroId}
                  hiddenLinkedMatch={hiddenLinkedMatch}
                  onRevealLinkedMatch={revealingFilters ? revealLinkedMatch : undefined}
                  overview={
                    <OverviewTab
                      entries={filteredEntries}
                      accountId={accountId}
                      filters={filters}
                      latestBadge={latestBadge}
                      onOpenMatch={openMatch}
                      onSelectHero={setHeroId}
                      formEntries={formEntries}
                      sessionContext={sessionContext}
                    />
                  }
                />
              )
            }
          </QueryRenderer>
        )}

        {tab === "heroes" && (
          <HeroesTab
            accountId={accountId}
            gameMode={gameMode}
            matchMode={matchMode}
            heroId={heroId}
            minUnixTimestamp={minUnixTimestamp}
            maxUnixTimestamp={maxUnixTimestamp}
            entries={formEntries}
            onSelectHero={(id) => {
              setHeroId(id);
              setExpandedMatchId(null);
              setTab("matches", { history: "push" });
            }}
          />
        )}

        {tab === "mates" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 text-lg font-semibold">Mates</h3>
              <MatesTab
                accountId={accountId}
                gameMode={gameMode}
                minUnixTimestamp={minUnixTimestamp}
                maxUnixTimestamp={maxUnixTimestamp}
                entries={filteredEntries}
              />
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-lg font-semibold">Enemies</h3>
              <EnemiesTab
                accountId={accountId}
                gameMode={gameMode}
                minUnixTimestamp={minUnixTimestamp}
                maxUnixTimestamp={maxUnixTimestamp}
                entries={filteredEntries}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
