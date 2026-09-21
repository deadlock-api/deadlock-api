import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { EnemiesTab, MatesTab } from "~/components/features/tracker/breakdown/PlayerStatsTable";
import { TrackerFilterBar } from "~/components/features/tracker/filters/TrackerFilterBar";
import { HeroesTab } from "~/components/features/tracker/heroes/HeroesTab";
import { MatchesTab } from "~/components/features/tracker/matches/MatchesTab";
import { OverviewSkeleton } from "~/components/features/tracker/overview/OverviewSkeleton";
import { OverviewTab } from "~/components/features/tracker/overview/OverviewTab";
import { PlayerHeader } from "~/components/features/tracker/shared/PlayerHeader";
import { TrackerEmptyState } from "~/components/features/tracker/shared/TrackerEmptyState";
import { TrackerQueryPaused } from "~/components/features/tracker/shared/TrackerQueryPaused";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Heading } from "~/components/ui/heading";
import { useTrackerFilters } from "~/hooks/useTrackerFilters";
import type { DateRange } from "~/lib/date-filter-preference";
import { filterMatches, filtersRevealing, type TrackerFilterValues } from "~/lib/tracker/compute";
import { filterRecoveryOptions } from "~/lib/tracker/filter-recovery";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

function focusMatchDetails(section: HTMLElement | null, matchId: number) {
  const details = section?.querySelector<HTMLElement>(`[data-match-details="${matchId}"]`);
  details?.focus({ preventScroll: true });
  details?.scrollIntoView({ block: "start" });
}

/** A player's whole tracker page. `notice` sits above the player header, for whatever the page has to say first. */
export function TrackerContent({
  accountId,
  notice,
  defaultDateRange,
}: {
  accountId: number;
  notice?: ReactNode;
  /** Replaces the visitor's season-or-patch default; has to be referentially stable. */
  defaultDateRange?: DateRange;
}) {
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
    defaultRange,
    minUnixTimestamp,
    maxUnixTimestamp,
    filters,
    applyFilters,
  } = useTrackerFilters(defaultDateRange);

  const sectionRef = useRef<HTMLElement>(null);
  const previousSection = useRef(tab);
  useEffect(() => {
    if (previousSection.current === tab) return;
    previousSection.current = tab;
    sectionRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView({ block: "start" });
  }, [tab]);

  const [expandedMatchId, setExpandedMatchId] = useQueryState("match", parseAsInteger);
  const requestedMatchFocus = useRef<number | null>(null);
  useEffect(() => {
    if (tab !== "matches" || expandedMatchId == null || requestedMatchFocus.current !== expandedMatchId) return;
    requestedMatchFocus.current = null;
    focusMatchDetails(sectionRef.current, expandedMatchId);
  }, [expandedMatchId, tab]);
  const openMatch = (matchId: number) => {
    requestedMatchFocus.current = matchId;
    setExpandedMatchId(matchId);
    setTab("matches");
    if (expandedMatchId === matchId && tab === "matches") {
      requestedMatchFocus.current = null;
      focusMatchDetails(sectionRef.current, matchId);
    }
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
    // Filter actions can remove their focused trigger, including recovery buttons and activity dialogs.
    if (revealCount > 0) sectionRef.current?.focus({ preventScroll: true });
  }, [revealCount]);
  const updateFilters = (next: TrackerFilterValues, clearMatch = false) => {
    applyFilters(next, { clearMatch });
    setRevealCount((count) => count + 1);
  };
  const revealLinkedMatch = () => {
    if (revealingFilters) updateFilters(revealingFilters);
  };

  return (
    <PageShell>
      {notice}
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
          resetRange={defaultRange}
        />
      </PlayerHeader>

      {historyQuery.fetchStatus === "paused" ? (
        <TrackerQueryPaused
          description={
            historyQuery.data
              ? "Showing loaded match history. Refresh resumes when you're back online."
              : "Match history will load automatically when you're back online."
          }
        />
      ) : historyQuery.isError ? (
        <ErrorState
          title={historyQuery.data ? "Could not refresh match history" : "Could not load match history"}
          description={
            historyQuery.data
              ? "Showing your last loaded matches. New matches may be missing until the next successful refresh."
              : "Your match history is temporarily unavailable. Try loading it again."
          }
          onRetry={() => historyQuery.refetch()}
          retrying={historyQuery.isFetching}
        />
      ) : null}

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
        className="flex min-w-0 scroll-mt-4 flex-col gap-3"
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
            <Heading as="h2" size="sm">
              {tab === "heroes" ? "All Hero Stats" : "Teammate & Opponent Stats"}
            </Heading>
          </div>
        )}
        {tab === "matches" && (
          <QueryRenderer
            query={historyQuery}
            loadingFallback={historyQuery.fetchStatus === "paused" ? null : <OverviewSkeleton />}
            errorFallback={() => null}
            keepDataOnError
          >
            {(history) =>
              filteredEntries.length === 0 && !hiddenLinkedMatch ? (
                <TrackerEmptyState
                  hasHistory={history.length > 0}
                  recoveries={recoveries}
                  onRecover={(next) => {
                    updateFilters(next, true);
                  }}
                />
              ) : (
                <MatchesTab
                  key={`${accountId}-${revealCount}`}
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
                      onFilterChange={(next) => updateFilters(next, true)}
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
            result={result}
            onSelectHero={(id) => {
              setHeroId(id);
              setExpandedMatchId(null);
              setTab("matches", { history: "push" });
            }}
          />
        )}

        {tab === "mates" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Section as="h3" title="Mates" className="gap-2">
              <MatesTab onOpenMatch={openMatch} accountId={accountId} filters={filters} entries={filteredEntries} />
            </Section>
            <Section as="h3" title="Enemies" className="gap-2">
              <EnemiesTab onOpenMatch={openMatch} accountId={accountId} filters={filters} entries={filteredEntries} />
            </Section>
          </div>
        )}
      </section>
    </PageShell>
  );
}
