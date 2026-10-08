import { useQuery } from "@tanstack/react-query";
import { Link, type NotFoundRouteProps, createFileRoute, notFound, redirect, useRouter } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { ListOrdered, type LucideIcon, Map, Medal, ShoppingBag, Swords, Trophy, Users, UsersRound } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { NotFound } from "~/components/app/NotFound";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroMatchupDetailsStatsTable } from "~/components/features/heroes/HeroMatchupDetailsStatsTable";
import { HeroMatchupSummary } from "~/components/features/heroes/HeroMatchupSummary";
import { HeroSkillOrder } from "~/components/features/heroes/HeroSkillOrder";
import { HeroTopItems } from "~/components/features/heroes/HeroTopItems";
import { ChartLoading } from "~/components/patterns/charts/ChartStates";
import { LinkCard } from "~/components/patterns/content/LinkCard";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ProfileHeader, ProfileHeaderMedia } from "~/components/patterns/page/ProfileHeader";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Badge } from "~/components/ui/badge";
import { Pips } from "~/components/ui/pips";
import { Inline } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { useSeasons } from "~/hooks/useSeasons";
import { computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { findKey } from "~/lib/find-keys";
import { formatPercent } from "~/lib/format";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { fetchHeroMatchups, type HeroMatchupsRequest } from "~/lib/hero-matchup-fns";
import { findHeroBySlug, heroSlug } from "~/lib/hero-slug";
import { catchPrefetch, ensureCached, prefetchCached } from "~/lib/prefetch-safe";
import { rankOf } from "~/lib/rank-of";
import { DEFAULT_RANK_RANGE, rankRangeLabel } from "~/lib/rank-utils";
import {
  defaultPeriodLabel,
  defaultPrevUnixRange,
  defaultTemporalCoverage,
  defaultUnixRange,
  type SeasonInfo,
} from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import { closestNameBySlug, findByIdSegment, slugify } from "~/lib/slug";
import { toneOf } from "~/lib/tone";
import {
  filterPlayableHeroes,
  heroesQueryOptions,
  itemUpgradesQueryOptions,
  loadSeasons,
} from "~/queries/asset-queries";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

const HeroWinRateByDuration = lazy(() =>
  import("~/components/features/heroes/HeroWinRateByDuration").then((m) => ({ default: m.HeroWinRateByDuration })),
);

const HeroWinRateOverTime = lazy(() =>
  import("~/components/features/heroes/HeroWinRateOverTime").then((m) => ({ default: m.HeroWinRateOverTime })),
);

const HeroWinRateByRank = lazy(() =>
  import("~/components/features/heroes/HeroWinRateByRank").then((m) => ({ default: m.HeroWinRateByRank })),
);

const GAME_MODE = "normal" as const;
/** The rank range as the analytics pages read it from the URL, so a link lands on the numbers this page quotes. */
const RANK_SEARCH = { min_rank: DEFAULT_RANK_RANGE.min, max_rank: DEFAULT_RANK_RANGE.max };

// No `minHeroMatches` / `minHeroMatchesTotal`, not even 0: either one sends the request to the exact-timestamp base
// table, while item stats come from day-grained rollups that start at midnight. Right after a mid-day patch the item
// counts then cover hours the hero counts do not, and "bought in X% of matches" passed 100%. Without them both come
// from the rollups over the same days.
function currentStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minAverageBadge: DEFAULT_RANK_RANGE.min,
    maxAverageBadge: DEFAULT_RANK_RANGE.max,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function byRankStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentItemStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minMatches: 10,
    minAverageBadge: DEFAULT_RANK_RANGE.min,
    maxAverageBadge: DEFAULT_RANK_RANGE.max,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentAbilityOrderParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minMatches: 20,
    minAverageBadge: DEFAULT_RANK_RANGE.min,
    maxAverageBadge: DEFAULT_RANK_RANGE.max,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentBanParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    matchMode: DEFAULT_MATCH_MODE,
    minAverageBadge: DEFAULT_RANK_RANGE.min,
    maxAverageBadge: DEFAULT_RANK_RANGE.max,
    ...defaultUnixRange(seasons, preference),
  };
}

function matchupsRequest(
  heroId: number,
  seasons: readonly SeasonInfo[],
  preference: DateFilterPreference = "season",
): HeroMatchupsRequest {
  const prev = defaultPrevUnixRange(seasons, preference);
  return {
    heroId,
    minAverageBadge: DEFAULT_RANK_RANGE.min,
    maxAverageBadge: DEFAULT_RANK_RANGE.max,
    ...defaultUnixRange(seasons, preference),
    prevMinUnixTimestamp: prev.minUnixTimestamp,
    prevMaxUnixTimestamp: prev.maxUnixTimestamp,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
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
      ensureCached(queryClient, heroesQueryOptions),
      loadSeasons(queryClient),
    ]);
    const playable = filterPlayableHeroes(heroes);
    const hero = findHeroBySlug(playable, params.heroName);
    if (!hero) {
      // "Haze", "grey_talon" or its id "15" name a hero: send them to its canonical address.
      const canonical =
        findHeroBySlug(playable, slugify(params.heroName)) ?? findByIdSegment(playable, params.heroName);
      if (canonical) {
        throw redirect({
          to: "/analytics/heroes/$heroName",
          params: { heroName: heroSlug(canonical.name) },
          statusCode: 301,
        });
      }
      throw notFound({ data: { suggestion: closestNameBySlug(playable, params.heroName)?.name } });
    }
    const [stats, ranks, , , , matchups] = await Promise.all([
      prefetchCached(queryClient, heroStatsQueryOptions(currentStatsParams(seasons, preferences.dateFilter))),
      prefetchCached(queryClient, ranksQueryOptions),
      prefetchCached(queryClient, heroBanStatsQueryOptions(currentBanParams(seasons, preferences.dateFilter))),
      prefetchCached(
        queryClient,
        itemStatsQueryOptions({ ...currentItemStatsParams(seasons, preferences.dateFilter), heroId: hero.id }),
      ),
      prefetchCached(queryClient, itemUpgradesQueryOptions),
      catchPrefetch(fetchHeroMatchups({ data: matchupsRequest(hero.id, seasons, preferences.dateFilter) })),
    ]);
    const cardImage = hero.images.hero_card_critical_webp ?? hero.images.icon_hero_card_webp ?? null;
    const summary = summarizeHeroStats(stats, hero.id);
    const color = hero.colors?.style ?? hero.colors?.ui;
    return {
      heroId: hero.id,
      heroName: hero.name,
      // The hero's own color tints its header; a data color, so it is passed to the component built for it.
      accent: color ? `rgb(${color.join(" ")})` : undefined,
      heroType: hero.hero_type ?? null,
      complexity: hero.complexity,
      slug: params.heroName,
      cardImage,
      breadcrumb: hero.name,
      matchups,
      rankRange: rankRangeLabel(ranks, DEFAULT_RANK_RANGE.min, DEFAULT_RANK_RANGE.max),
      coverage: defaultTemporalCoverage(seasons, preferences.dateFilter),
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
    // The not-found page sets its own title and noindex; a second title and a canonical to the section came first.
    if (!loaderData) return {};
    const { heroName, slug, cardImage, rankRange, coverage, summary } = loaderData;
    const description = summary
      ? `${heroName} holds a ${formatPercent(summary.winRate)} win rate (#${summary.rank} of ${summary.heroCount} heroes) and a ${formatPercent(summary.pickRate)} pick rate in ${rankRange} Deadlock matches. Live matchups, synergies, and counters, updated daily.`
      : `${heroName} win rate, pick rate, best items, and matchups in Deadlock. Live stats from tracked matches, updated daily.`;
    return seo({
      title: pageTitle(`${heroName} Win Rate & Pick Rate`),
      description,
      path: `/analytics/heroes/${slug}`,
      ogImage: cardImage ?? undefined,
      ogImageKind: cardImage ? "thumbnail" : "card",
      jsonLd: datasetJsonLd({
        name: `Deadlock ${heroName} Win Rate & Pick Rate`,
        description: `Win rate, pick rate, ban rate, and matchup statistics for ${heroName} in Deadlock, calculated from tracked ${rankRange} matches and updated daily.`,
        path: `/analytics/heroes/${slug}`,
        keywords: ["Deadlock", heroName, "win rate", "pick rate", "matchups"],
        variableMeasured: ["win rate", "pick rate", "ban rate", "matchup win rate"],
        temporalCoverage: coverage,
        apiPath: "/v1/analytics/hero-stats",
      }),
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
    | "/analytics/heroes/tier-list"
    | "/analytics/heroes/matchup-details"
    | "/analytics/heroes/combos"
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

const HERO_TYPE_LABEL = { assassin: "Assassin", brawler: "Brawler", marksman: "Marksman", mystic: "Mystic" } as const;
const MAX_COMPLEXITY = 3;

function HeroDetailPage() {
  const { preferences } = Route.useRouteContext();
  const { heroId, heroName, rankRange, matchups, accent, heroType, complexity } = Route.useLoaderData();
  const router = useRouter();
  const retryMatchups = () => void router.invalidate();
  const { seasons } = useSeasons();
  const period = defaultPeriodLabel(seasons, preferences.dateFilter);
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
    summary && rank !== undefined ? `#${rank} of ${total ?? summary.heroCount}` : undefined;

  return (
    <PageShell density="content">
      <ProfileHeader
        accent={accent}
        media={
          <ProfileHeaderMedia shape="portrait">
            <HeroImage heroId={heroId} art="portrait" title="" className="size-full" />
          </ProfileHeaderMedia>
        }
        eyebrow={
          <>
            {heroType && (
              <Badge variant="outline" size="sm">
                {HERO_TYPE_LABEL[heroType]}
              </Badge>
            )}
            {complexity > 0 && (
              <Inline gap={1.5} align="center">
                Complexity
                <Pips value={complexity} max={MAX_COMPLEXITY} label={`Complexity ${complexity} of ${MAX_COMPLEXITY}`} />
              </Inline>
            )}
            <span>
              {rankRange} · {period}
            </span>
          </>
        }
        title={
          <>
            {heroName} <span className="text-muted-foreground">Stats &amp; Builds</span>
          </>
        }
        description={
          summary ? (
            <>
              {heroName} wins <span className="font-semibold text-foreground">{formatPercent(summary.winRate)}</span> of{" "}
              {summary.matches.toLocaleString("en-US")} tracked {rankRange} matches in {period}. Best items, skill
              order, matchups and trends below, refreshed daily from live match data.
            </>
          ) : (
            `Live win rate, pick rate, builds and matchups for ${heroName} in Deadlock, from tracked ${rankRange} matches and updated daily.`
          )
        }
      >
        {summary ? (
          <StatGroup variant="plain" className="grid-cols-2 @lg:grid-cols-4">
            <Stat
              data-find={findKey.stat("win_rate")}
              label="Win Rate"
              value={formatPercent(summary.winRate)}
              tone={toneOf(summary.winRate, 0.5)}
              sub={rankLabel(summary.winRateRank)}
            />
            <Stat
              data-find={findKey.stat("pick_rate")}
              label="Pick Rate"
              value={formatPercent(summary.pickRate)}
              sub={rankLabel(summary.pickRateRank)}
            />
            <Stat
              data-find={findKey.stat("ban_rate")}
              label="Ban Rate"
              value={summary.banRate !== undefined ? formatPercent(summary.banRate) : undefined}
              sub={rankLabel(summary.banRateRank, summary.banHeroCount)}
            />
            <Stat
              data-find={findKey.stat("matches")}
              label="Matches"
              value={summary.matches.toLocaleString("en-US")}
              sub="tracked"
            />
          </StatGroup>
        ) : (
          statsQuery.isError && (
            // Every section below reads these stats; without them the page would silently end after its header.
            <ErrorState
              variant="inline"
              title={`${heroName}'s stats did not load`}
              onRetry={() => void statsQuery.refetch()}
            />
          )
        )}
      </ProfileHeader>

      {summary && (
        <Section title={`${heroName} Builds`} description={`What ${heroName} buys and levels first.`}>
          <div className="grid gap-4">
            <HeroTopItems
              heroId={heroId}
              heroName={heroName}
              heroMatches={summary.matches}
              rankRange={rankRange}
              request={currentItemStatsParams(seasons, preferences.dateFilter)}
            />
            <HeroSkillOrder
              heroId={heroId}
              heroName={heroName}
              request={currentAbilityOrderParams(seasons, preferences.dateFilter)}
              rankRange={rankRange}
              totalMatches={summary.matches}
            />
          </div>
        </Section>
      )}

      {summary && (
        <Section
          title={`${heroName} Win Rate Trends`}
          description={`How ${heroName} performs over time, by rank and by match length.`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ChunkErrorBoundary>
              <Suspense fallback={<ChartLoading label="win rate over time" size="lg" className="lg:col-span-2" />}>
                <HeroWinRateOverTime
                  className="lg:col-span-2"
                  heroId={heroId}
                  heroName={heroName}
                  request={currentStatsParams(seasons, preferences.dateFilter)}
                  rankRange={rankRange}
                />
              </Suspense>
            </ChunkErrorBoundary>
            <ChunkErrorBoundary>
              <Suspense fallback={<ChartLoading label="win rate by rank" />}>
                <HeroWinRateByRank
                  heroId={heroId}
                  heroName={heroName}
                  request={byRankStatsParams(seasons, preferences.dateFilter)}
                />
              </Suspense>
            </ChunkErrorBoundary>
            <ChunkErrorBoundary>
              <Suspense fallback={<ChartLoading label="win rate by match length" />}>
                <HeroWinRateByDuration
                  heroId={heroId}
                  heroName={heroName}
                  request={currentStatsParams(seasons, preferences.dateFilter)}
                  rankRange={rankRange}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </Section>
      )}

      <Section
        title={`${heroName} Matchups & Synergies`}
        description={`Who ${heroName} beats, who beats ${heroName}, and the teammates that lift both, in ${rankRange} matches.`}
      >
        <HeroMatchupSummary heroName={heroName} matchups={matchups} onRetry={retryMatchups} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title={`${heroName} with Teammates`} description="Win rate change as allies" />
            <HeroMatchupDetailsStatsTable stat={0} matchups={matchups} onRetry={retryMatchups} linkHeroes />
          </Panel>
          <Panel>
            <PanelHeader title={`${heroName} against Enemies`} description="Win rate change as opponents" />
            <HeroMatchupDetailsStatsTable stat={1} matchups={matchups} onRetry={retryMatchups} linkHeroes />
          </Panel>
        </div>
      </Section>

      <Section title={`More ${heroName} Stats`}>
        <nav aria-label={`More ${heroName} stats`} className="@container">
          <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
            <HeroLinkCard
              to="/analytics/heroes/matchup-details"
              search={{ hero_id: heroId, ...RANK_SEARCH }}
              icon={Swords}
              title="Counters"
              description={`Every hero ${heroName} beats or loses to, with the win rate swing.`}
            />
            <HeroLinkCard
              to="/analytics/heroes/combos"
              search={{ comb_include_heroes: heroId, ...RANK_SEARCH }}
              icon={UsersRound}
              title="Best Duos"
              description={`The teammates that win most often next to ${heroName}.`}
            />
            <HeroLinkCard
              to="/analytics/items"
              search={{ hero: heroId, ...RANK_SEARCH }}
              icon={ShoppingBag}
              title="Item Builds"
              description={`Win rates, buy timings, and combos for every item on ${heroName}.`}
            />
            <HeroLinkCard
              to="/analytics/abilities"
              search={{ hero_id: heroId, ...RANK_SEARCH }}
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
              search={{ hero: heroId, ...RANK_SEARCH }}
              icon={Users}
              title="Player Scoreboard"
              description={`Who racks up the most kills, souls, and damage on ${heroName}.`}
            />
            <HeroLinkCard
              to="/community/heatmap"
              search={{ hero_id: heroId, ...RANK_SEARCH }}
              icon={Map}
              title="Kill Heatmap"
              description={`Where ${heroName} gets kills and dies across the map.`}
            />
            <HeroLinkCard
              to="/analytics/heroes/tier-list"
              search={{}}
              icon={Medal}
              title="Tier List"
              description={`Where ${heroName} ranks among every hero, from S to D tier.`}
            />
          </div>
        </nav>
      </Section>
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
