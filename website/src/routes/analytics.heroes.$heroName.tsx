import { useQuery } from "@tanstack/react-query";
import { Link, type NotFoundRouteProps, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { ListOrdered, type LucideIcon, Map, ShoppingBag, Trophy, Users } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { NotFound } from "~/components/app/NotFound";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { LinkCard } from "~/components/patterns/content/LinkCard";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { useSeasons } from "~/hooks/useSeasons";
import { computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { formatPercent } from "~/lib/format";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { findHeroBySlug, heroSlug } from "~/lib/hero-slug";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { rankOf } from "~/lib/rank-of";
import {
  defaultDateRange,
  defaultPeriodLabel,
  defaultPrevDateRange,
  defaultUnixRange,
  type SeasonInfo,
} from "~/lib/seasons";
import { SITE_URL, seo } from "~/lib/seo";
import { closestNameBySlug, slugify } from "~/lib/slug";
import {
  filterPlayableHeroes,
  heroesQueryOptions,
  itemUpgradesQueryOptions,
  loadSeasons,
} from "~/queries/asset-queries";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const HeroMatchupDetailsStatsTable = lazy(() =>
  import("~/components/features/heroes/HeroMatchupDetailsStatsTable").then((m) => ({
    default: m.HeroMatchupDetailsStatsTable,
  })),
);

const HeroMatchupSummary = lazy(() =>
  import("~/components/features/heroes/HeroMatchupSummary").then((m) => ({ default: m.HeroMatchupSummary })),
);

const HeroSkillOrder = lazy(() =>
  import("~/components/features/heroes/HeroSkillOrder").then((m) => ({ default: m.HeroSkillOrder })),
);

const HeroTopItems = lazy(() =>
  import("~/components/features/heroes/HeroTopItems").then((m) => ({ default: m.HeroTopItems })),
);

const HeroWinRateByDuration = lazy(() =>
  import("~/components/features/heroes/HeroWinRateByDuration").then((m) => ({ default: m.HeroWinRateByDuration })),
);

const HeroWinRateOverTime = lazy(() =>
  import("~/components/features/heroes/HeroWinRateOverTime").then((m) => ({ default: m.HeroWinRateOverTime })),
);

const HeroWinRateByRank = lazy(() =>
  import("~/components/features/heroes/HeroWinRateByRank").then((m) => ({ default: m.HeroWinRateByRank })),
);

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;
const GAME_MODE = "normal" as const;

function currentStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minHeroMatches: 0,
    minHeroMatchesTotal: 0,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function byRankStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minHeroMatches: 0,
    minHeroMatchesTotal: 0,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentItemStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minMatches: 10,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentAbilityOrderParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minMatches: 20,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentBanParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    matchMode: DEFAULT_MATCH_MODE,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    ...defaultUnixRange(seasons, preference),
  };
}

function summarizeHeroStats(rows: readonly AnalyticsHeroStats[] | undefined, heroId: number) {
  if (!rows || rows.length === 0) return null;
  const row = rows.find((r) => r.hero_id === heroId);
  if (!row || row.matches === 0) return null;
  let sumMatches = 0;
  for (const r of rows) sumMatches += r.matches;
  const played = rows.filter((r) => r.matches > 0);
  return {
    winRate: row.wins / row.matches,
    pickRate: sumMatches > 0 ? getPickrateMultiplier(GAME_MODE) * (row.matches / sumMatches) : 0,
    matches: row.matches,
    heroCount: played.length,
    winRateRank: rankOf(
      row.wins / row.matches,
      played.map((r) => r.wins / r.matches),
    ),
    pickRateRank: rankOf(
      row.matches,
      played.map((r) => r.matches),
    ),
  };
}

export const Route = createFileRoute("/analytics/heroes/$heroName")({
  component: HeroDetailPage,
  loader: async ({ context: { queryClient, preferences }, params }) => {
    const [heroes, seasons] = await Promise.all([
      queryClient.ensureQueryData(heroesQueryOptions),
      loadSeasons(queryClient),
    ]);
    const playable = filterPlayableHeroes(heroes);
    const hero = findHeroBySlug(playable, params.heroName);
    if (!hero) {
      // "Haze" or "grey_talon" name a hero exactly once normalized: send them to its canonical address.
      const canonical = findHeroBySlug(playable, slugify(params.heroName));
      if (canonical) {
        throw redirect({
          to: "/analytics/heroes/$heroName",
          params: { heroName: heroSlug(canonical.name) },
          statusCode: 301,
        });
      }
      throw notFound({ data: { suggestion: closestNameBySlug(playable, params.heroName)?.name } });
    }
    const [stats] = await Promise.all([
      prefetchSafe(
        queryClient.ensureQueryData(heroStatsQueryOptions(currentStatsParams(seasons, preferences.dateFilter))),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(heroBanStatsQueryOptions(currentBanParams(seasons, preferences.dateFilter))),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          itemStatsQueryOptions({ ...currentItemStatsParams(seasons, preferences.dateFilter), heroId: hero.id }),
        ),
      ),
      prefetchSafe(queryClient.ensureQueryData(itemUpgradesQueryOptions)),
    ]);
    const cardImage = hero.images.hero_card_critical_webp ?? hero.images.icon_hero_card_webp ?? null;
    const summary = summarizeHeroStats(stats, hero.id);
    return {
      heroId: hero.id,
      heroName: hero.name,
      slug: params.heroName,
      cardImage,
      breadcrumb: hero.name,
      summary: summary && {
        winRate: summary.winRate,
        pickRate: summary.pickRate,
        rank: summary.winRateRank,
        heroCount: summary.heroCount,
      },
    };
  },
  notFoundComponent: HeroNotFound,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({
        title: "Hero Not Found | Deadlock",
        description: "The requested Deadlock hero could not be found.",
        path: "/analytics/heroes",
      });
    }
    const { heroName, slug, cardImage, summary } = loaderData;
    const url = `${SITE_URL}/analytics/heroes/${slug}`;
    const description = summary
      ? `${heroName} holds a ${formatPercent(summary.winRate)} win rate (#${summary.rank} of ${summary.heroCount} heroes) and a ${formatPercent(summary.pickRate)} pick rate in Deadlock matches. Live matchups, synergies, and counters, updated daily.`
      : `${heroName} win rate, pick rate, best items, and matchups in Deadlock. Live stats from tracked matches, updated daily.`;
    return seo({
      title: `${heroName} Win Rate & Pick Rate | Deadlock`,
      description,
      path: `/analytics/heroes/${slug}`,
      ogImage: cardImage ?? undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `${heroName} Win Rate & Pick Rate | Deadlock`,
        description: `Win rate, pick rate, ban rate, and matchup statistics for ${heroName} in Deadlock, calculated from tracked matches and updated daily.`,
        url,
        keywords: ["Deadlock", heroName, "win rate", "pick rate", "matchups"],
        creator: { "@type": "Organization", name: "Deadlock API", url: SITE_URL },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
      },
    });
  },
});

function HeroLinkCard({
  to,
  search,
  icon: Icon,
  title,
  description,
}: {
  to:
    | "/analytics/items"
    | "/analytics/abilities"
    | "/community/leaderboard"
    | "/analytics/players"
    | "/community/heatmap";
  search: Record<string, number>;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <LinkCard asChild size="sm" orientation="horizontal" media={<Icon />} title={title} description={description}>
      <Link to={to} search={search} preload="intent" />
    </LinkCard>
  );
}

function HeroDetailPage() {
  const { preferences } = Route.useRouteContext();
  const { heroId, heroName } = Route.useLoaderData();
  const { seasons } = useSeasons();
  const period = defaultPeriodLabel(seasons, preferences.dateFilter);
  const [defaultStart, defaultEnd] = defaultDateRange(seasons, preferences.dateFilter);
  const [prevStart, prevEnd] = defaultPrevDateRange(seasons, preferences.dateFilter);
  const statsQuery = useQuery(heroStatsQueryOptions(currentStatsParams(seasons, preferences.dateFilter)));
  const banQuery = useQuery(heroBanStatsQueryOptions(currentBanParams(seasons, preferences.dateFilter)));

  const summary = useMemo(() => {
    const base = summarizeHeroStats(statsQuery.data, heroId);
    if (!base) return null;
    const banRates = banQuery.data ? computeBanRates(banQuery.data) : undefined;
    const banRate = banRates?.get(heroId);
    const banRateRank = banRate !== undefined && banRates ? rankOf(banRate, [...banRates.values()]) : undefined;
    // Ranked among the heroes with ban data, so "of N" counts those, not the heroes played (they can differ).
    return { ...base, banRate, banRateRank, banHeroCount: banRates?.size };
  }, [statsQuery.data, banQuery.data, heroId]);

  const rankLabel = (rank: number | undefined, total?: number) =>
    summary && rank !== undefined ? `#${rank} of ${total ?? summary.heroCount} heroes` : undefined;

  return (
    <PageShell>
      <PageHeader
        media={<HeroImage heroId={heroId} className="size-12" />}
        title={<>{heroName}: Deadlock Win Rate &amp; Pick Rate</>}
        description={
          summary ? (
            <>
              {period === "this season" ? "This season" : "In the current patch"}, {heroName} holds a{" "}
              <span className="font-semibold text-foreground">{formatPercent(summary.winRate)}</span> win rate across{" "}
              <span className="font-semibold text-foreground">{summary.matches.toLocaleString("en-US")}</span> tracked
              matches, with a <span className="font-semibold text-foreground">{formatPercent(summary.pickRate)}</span>{" "}
              pick rate
              {summary.banRate !== undefined && (
                <>
                  {" "}
                  and a <span className="font-semibold text-foreground">{formatPercent(summary.banRate)}</span> ban rate
                </>
              )}
              . Numbers are drawn from live match data and refreshed daily.
            </>
          ) : (
            `Live win rate, pick rate, and matchup statistics for ${heroName} in Deadlock, drawn from tracked matches and updated daily.`
          )
        }
      />

      {summary && (
        <StatGroup variant="tiles" className="grid-cols-2 sm:grid-cols-4">
          <Stat label="Win Rate" value={formatPercent(summary.winRate)} sub={rankLabel(summary.winRateRank)} />
          <Stat label="Pick Rate" value={formatPercent(summary.pickRate)} sub={rankLabel(summary.pickRateRank)} />
          <Stat label="Matches" value={summary.matches.toLocaleString("en-US")} />
          <Stat
            label="Ban Rate"
            value={summary.banRate !== undefined ? formatPercent(summary.banRate) : "—"}
            sub={rankLabel(summary.banRateRank, summary.banHeroCount)}
          />
        </StatGroup>
      )}

      {/* Every section below reads these stats; without them the page would silently end after its header. */}
      {!summary && statsQuery.isError && (
        <ErrorState title={`${heroName}'s stats did not load`} onRetry={() => void statsQuery.refetch()} />
      )}

      {summary && (
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <HeroTopItems
              heroId={heroId}
              heroName={heroName}
              heroMatches={summary.matches}
              request={currentItemStatsParams(seasons, preferences.dateFilter)}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      {summary && (
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <HeroSkillOrder
              heroId={heroId}
              heroName={heroName}
              request={currentAbilityOrderParams(seasons, preferences.dateFilter)}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      {summary && (
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <HeroWinRateOverTime
              heroId={heroId}
              heroName={heroName}
              request={currentStatsParams(seasons, preferences.dateFilter)}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      {summary && (
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <HeroWinRateByRank
              heroId={heroId}
              heroName={heroName}
              request={byRankStatsParams(seasons, preferences.dateFilter)}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      {summary && (
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <HeroWinRateByDuration
              heroId={heroId}
              heroName={heroName}
              request={currentStatsParams(seasons, preferences.dateFilter)}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      <Section
        title={`${heroName} Matchups & Synergies`}
        description={`Which heroes ${heroName} counters, which heroes counter ${heroName}, and the best teammates to pair with.`}
      >
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <HeroMatchupSummary
              heroId={heroId}
              heroName={heroName}
              minRankId={DEFAULT_MIN_RANK}
              maxRankId={DEFAULT_MAX_RANK}
              minDate={defaultStart}
              maxDate={defaultEnd}
              gameMode={GAME_MODE}
              matchMode={DEFAULT_MATCH_MODE}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={0}
                minRankId={DEFAULT_MIN_RANK}
                maxRankId={DEFAULT_MAX_RANK}
                minDate={defaultStart}
                maxDate={defaultEnd}
                prevMinDate={prevStart}
                prevMaxDate={prevEnd}
                gameMode={GAME_MODE}
                matchMode={DEFAULT_MATCH_MODE}
                linkHeroes
              />
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={1}
                minRankId={DEFAULT_MIN_RANK}
                maxRankId={DEFAULT_MAX_RANK}
                minDate={defaultStart}
                maxDate={defaultEnd}
                prevMinDate={prevStart}
                prevMaxDate={prevEnd}
                gameMode={GAME_MODE}
                matchMode={DEFAULT_MATCH_MODE}
                linkHeroes
              />
            </div>
          </Suspense>
        </ChunkErrorBoundary>
      </Section>

      <Section title={`More ${heroName} Stats`}>
        <nav aria-label={`More ${heroName} stats`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <HeroLinkCard
            to="/analytics/items"
            search={{ hero: heroId }}
            icon={ShoppingBag}
            title="Item Builds"
            description={`Win rates, buy timings, and combos for every item on ${heroName}.`}
          />
          <HeroLinkCard
            to="/analytics/abilities"
            search={{ hero_id: heroId }}
            icon={ListOrdered}
            title="Ability Builds"
            description={`The most common ${heroName} skill orders and how often they win.`}
          />
          <HeroLinkCard
            to="/community/leaderboard"
            search={{ hero_id: heroId }}
            icon={Trophy}
            title="Top Players"
            description={`The highest ranked ${heroName} players in each region.`}
          />
          <HeroLinkCard
            to="/analytics/players"
            search={{ hero: heroId }}
            icon={Users}
            title="Player Scoreboard"
            description={`Who racks up the most kills, souls, and damage on ${heroName}.`}
          />
          <HeroLinkCard
            to="/community/heatmap"
            search={{ hero_id: heroId }}
            icon={Map}
            title="Kill Heatmap"
            description={`Where ${heroName} gets kills and dies across the map.`}
          />
        </nav>
      </Section>

      <Stack gap={4}>
        <Separator />
        <nav aria-label="Related pages" className="flex flex-wrap gap-4 text-sm">
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/analytics/heroes" preload="intent">
              All hero win rates
            </Link>
          </Button>
        </nav>
      </Stack>
    </PageShell>
  );
}

function HeroNotFound({ data }: NotFoundRouteProps) {
  const suggestion = (data as { suggestion?: string } | undefined)?.suggestion;
  return (
    <NotFound
      didYouMean={
        suggestion && (
          <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(suggestion) }}>
            {suggestion}
          </Link>
        )
      }
    />
  );
}
