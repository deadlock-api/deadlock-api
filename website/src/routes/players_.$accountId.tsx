import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useMemo } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { QueryRenderer } from "~/components/QueryRenderer";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { EnemiesTab, MatesTab } from "~/components/tracker-page/breakdown/PlayerStatsTable";
import { TrackerFilterBar } from "~/components/tracker-page/filters/TrackerFilterBar";
import { HeroesTab } from "~/components/tracker-page/heroes/HeroesTab";
import { MatchesTab } from "~/components/tracker-page/matches/MatchesTab";
import { OverviewTab } from "~/components/tracker-page/overview/OverviewTab";
import { PlayerHeader } from "~/components/tracker-page/shared/PlayerHeader";
import { TrackerGate } from "~/components/tracker-page/shared/TrackerGate";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type TrackerTab, useTrackerFilters } from "~/hooks/useTrackerFilters";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { parseSteamIdToId3 } from "~/lib/steam";
import { filterMatches } from "~/lib/tracker/compute";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

const TAB_OPTIONS: { value: TrackerTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "matches", label: "Matches" },
  { value: "heroes", label: "Heroes" },
  { value: "mates", label: "Mates & Enemies" },
];

export const Route = createFileRoute("/players_/$accountId")({
  component: TrackerRoute,
  loader: async ({ context: { queryClient }, params }) => {
    const accountId = Number(parseSteamIdToId3(params.accountId.trim()));
    if (!Number.isInteger(accountId) || accountId <= 0) throw notFound();
    // Canonicalize SteamID64 (or bracketed) URLs to the SteamID3 form.
    if (String(accountId) !== params.accountId) {
      throw redirect({ to: "/players/$accountId", params: { accountId: String(accountId) } });
    }
    await Promise.all([
      prefetchSafe(queryClient.ensureQueryData(heroesQueryOptions)),
      prefetchSafe(queryClient.ensureQueryData(ranksQueryOptions)),
    ]);
    return { accountId };
  },
  head: ({ loaderData }) =>
    seo({
      title: "Player Tracker | Deadlock",
      description:
        "Full Deadlock match history, rank progression, hero breakdowns, and mate & opponent analytics for prioritized players.",
      path: loaderData ? `/players/${loaderData.accountId}` : "/players",
    }),
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

  const historyQuery = useQuery(trackerMatchHistoryQueryOptions(accountId));
  const { data: ranks = [] } = useQuery(ranksQueryOptions);

  const filteredEntries = useMemo(() => filterMatches(historyQuery.data ?? [], filters), [historyQuery.data, filters]);

  const loadingFallback = (
    <div className="flex items-center justify-center py-24">
      <LoadingLogo />
    </div>
  );

  return (
    <div className="space-y-6">
      <PlayerHeader accountId={accountId} entries={historyQuery.data} ranks={ranks} />

      {historyQuery.data?.length === 0 && (
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No match history found for this account yet. If it was prioritized recently, data may still be backfilling.
        </p>
      )}

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

      <Tabs value={tab} onValueChange={(value) => setTab(value as TrackerTab)} className="tabs-nav w-full">
        <ResponsiveTabsList
          value={tab}
          onValueChange={(value) => setTab(value as TrackerTab)}
          options={TAB_OPTIONS}
          ariaLabel="Player tracker sections"
        />

        <TabsContent value="overview">
          <QueryRenderer query={historyQuery} loadingFallback={loadingFallback}>
            {() => <OverviewTab entries={filteredEntries} ranks={ranks} onViewAllMatches={() => setTab("matches")} />}
          </QueryRenderer>
        </TabsContent>

        <TabsContent value="matches">
          <QueryRenderer query={historyQuery} loadingFallback={loadingFallback}>
            {() => <MatchesTab entries={filteredEntries} ranks={ranks} accountId={accountId} />}
          </QueryRenderer>
        </TabsContent>

        <TabsContent value="heroes">
          <HeroesTab
            accountId={accountId}
            gameMode={gameMode}
            matchMode={matchMode}
            heroId={heroId}
            minUnixTimestamp={minUnixTimestamp}
            maxUnixTimestamp={maxUnixTimestamp}
          />
        </TabsContent>

        <TabsContent value="mates">
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-lg font-semibold">Mates</h3>
              <MatesTab
                accountId={accountId}
                gameMode={gameMode}
                minUnixTimestamp={minUnixTimestamp}
                maxUnixTimestamp={maxUnixTimestamp}
                entries={filteredEntries}
              />
            </div>
            <div>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
