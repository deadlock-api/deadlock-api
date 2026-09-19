import { useQuery } from "@tanstack/react-query";
import { Link, type NotFoundRouteProps, createFileRoute, notFound } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { ListOrdered, type LucideIcon, Map, ShoppingBag, Trophy, Users } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { HeroImage } from "~/components/HeroImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import { NotFound } from "~/components/NotFound";
import { DEFAULT_MATCH_MODE } from "~/components/selectors/MatchModeSelector";
import { StatCard } from "~/components/StatCard";
import { useSeasons } from "~/hooks/useSeasons";
import { computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { formatPercent } from "~/lib/format";
import { findHeroBySlug, heroSlug } from "~/lib/hero-slug";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { rankOf } from "~/lib/rank-of";
import { defaultDateRange, defaultPrevDateRange, type SeasonInfo, defaultUnixRange } from "~/lib/seasons";
import { SITE_URL, seo } from "~/lib/seo";
import { closestNameBySlug } from "~/lib/slug";
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
  import("~/components/heroes-page/HeroMatchupDetailsStatsTable").then((m) => ({
    default: m.HeroMatchupDetailsStatsTable,
  })),
);

const HeroMatchupSummary = lazy(() =>
  import("~/components/heroes-page/HeroMatchupSummary").then((m) => ({ default: m.HeroMatchupSummary })),
);

const HeroSkillOrder = lazy(() =>
  import("~/components/heroes-page/HeroSkillOrder").then((m) => ({ default: m.HeroSkillOrder })),
);

const HeroTopItems = lazy(() =>
  import("~/components/heroes-page/HeroTopItems").then((m) => ({ default: m.HeroTopItems })),
);

const HeroWinRateByDuration = lazy(() =>
  import("~/components/heroes-page/HeroWinRateByDuration").then((m) => ({ default: m.HeroWinRateByDuration })),
);

const HeroWinRateOverTime = lazy(() =>
  import("~/components/heroes-page/HeroWinRateOverTime").then((m) => ({ default: m.HeroWinRateOverTime })),
);

const HeroWinRateByRank = lazy(() =>
  import("~/components/heroes-page/HeroWinRateByRank").then((m) => ({ default: m.HeroWinRateByRank })),
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
    if (!hero) throw notFound({ data: { suggestion: closestNameBySlug(playable, params.heroName)?.name } });
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
    const url = `${SITE_URL}/heroes/${slug}`;
    const description = summary
      ? `${heroName} holds a ${formatPercent(summary.winRate)} win rate (#${summary.rank} of ${summary.heroCount} heroes) and a ${formatPercent(summary.pickRate)} pick rate in Deadlock ranked matches. Live matchups, synergies, and counters, updated daily.`
      : `${heroName} win rate, pick rate, best items, and matchups in Deadlock. Live stats from tracked ranked matches, updated daily.`;
    return seo({
      title: `${heroName} Win Rate & Pick Rate | Deadlock`,
      description,
      path: `/analytics/heroes/${slug}`,
      ogImage: cardImage ?? undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `${heroName} Win Rate & Pick Rate | Deadlock`,
        description: `Win rate, pick rate, ban rate, and matchup statistics for ${heroName} in Deadlock, calculated from tracked ranked matches and updated daily.`,
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
    <Link
      to={to}
      search={search}
      preload="intent"
      className="group flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}

function HeroDetailPage() {
  const { preferences } = Route.useRouteContext();
  const { heroId, heroName } = Route.useLoaderData();
  const { seasons } = useSeasons();
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
    return { ...base, banRate, banRateRank };
  }, [statsQuery.data, banQuery.data, heroId]);

  const rankLabel = (rank: number | undefined) =>
    summary && rank !== undefined ? `#${rank} of ${summary.heroCount} heroes` : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <HeroImage heroId={heroId} className="size-12" />
        <h1 className="text-2xl font-bold tracking-tight">{heroName}: Deadlock Win Rate &amp; Pick Rate</h1>
      </div>

      {summary ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          In the current patch, {heroName} holds a{" "}
          <span className="font-semibold text-foreground">{formatPercent(summary.winRate)}</span> win rate across{" "}
          <span className="font-semibold text-foreground">{summary.matches.toLocaleString("en-US")}</span> tracked
          ranked matches, with a{" "}
          <span className="font-semibold text-foreground">{formatPercent(summary.pickRate)}</span> pick rate
          {summary.banRate !== undefined && (
            <>
              {" "}
              and a <span className="font-semibold text-foreground">{formatPercent(summary.banRate)}</span> ban rate
            </>
          )}
          . Numbers are drawn from live match data and refreshed daily.
        </p>
      ) : (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Live win rate, pick rate, and matchup statistics for {heroName} in Deadlock, drawn from tracked ranked matches
          and updated daily.
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Win Rate" value={formatPercent(summary.winRate)} sub={rankLabel(summary.winRateRank)} />
          <StatCard label="Pick Rate" value={formatPercent(summary.pickRate)} sub={rankLabel(summary.pickRateRank)} />
          <StatCard label="Matches" value={summary.matches.toLocaleString("en-US")} />
          <StatCard
            label="Ban Rate"
            value={summary.banRate !== undefined ? formatPercent(summary.banRate) : "—"}
            sub={rankLabel(summary.banRateRank)}
          />
        </div>
      )}

      {summary && (
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingLogo />}>
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
          <Suspense fallback={<LoadingLogo />}>
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
          <Suspense fallback={<LoadingLogo />}>
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
          <Suspense fallback={<LoadingLogo />}>
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
          <Suspense fallback={<LoadingLogo />}>
            <HeroWinRateByDuration
              heroId={heroId}
              heroName={heroName}
              request={currentStatsParams(seasons, preferences.dateFilter)}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{heroName} Matchups & Synergies</h2>
        <p className="text-sm text-muted-foreground">
          Which heroes {heroName} counters, which heroes counter {heroName}, and the best teammates to pair with.
        </p>
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingLogo />}>
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
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">More {heroName} Stats</h2>
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
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        <Link to="/analytics/heroes" preload="intent" className="font-medium text-primary underline underline-offset-4">
          All hero win rates
        </Link>
      </nav>
    </div>
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
