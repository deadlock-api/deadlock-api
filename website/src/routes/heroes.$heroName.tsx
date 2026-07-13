import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";

import { Breadcrumb } from "~/components/Breadcrumb";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { HeroImage } from "~/components/HeroImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import { computeBanRates } from "~/lib/ban-rate";
import { DEFAULT_DATE_RANGE, DEFAULT_PREV_DATE_RANGE, getPickrateMultiplier } from "~/lib/constants";
import { findHeroBySlug } from "~/lib/hero-slug";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { SITE_URL, seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { filterPlayableHeroes, heroesQueryOptions } from "~/queries/asset-queries";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

const HeroMatchupDetailsStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroMatchupDetailsStatsTable").then((m) => ({
    default: m.HeroMatchupDetailsStatsTable,
  })),
);

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;
const GAME_MODE = "normal" as const;

function currentStatsParams() {
  return {
    minHeroMatches: 0,
    minHeroMatchesTotal: 0,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    gameMode: GAME_MODE,
    minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
    maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
  };
}

function currentBanParams() {
  return {
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
    maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
  };
}

export const Route = createFileRoute("/heroes/$heroName")({
  component: HeroDetailPage,
  loader: async ({ context: { queryClient }, params }) => {
    const heroes = await queryClient.ensureQueryData(heroesQueryOptions);
    const hero = findHeroBySlug(filterPlayableHeroes(heroes), params.heroName);
    if (!hero) throw notFound();
    await Promise.all([
      prefetchSafe(queryClient.ensureQueryData(heroStatsQueryOptions(currentStatsParams()))),
      prefetchSafe(queryClient.ensureQueryData(heroBanStatsQueryOptions(currentBanParams()))),
    ]);
    const cardImage = hero.images.hero_card_critical_webp ?? hero.images.icon_hero_card_webp ?? null;
    return { heroId: hero.id, heroName: hero.name, slug: params.heroName, cardImage };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({
        title: "Hero Not Found — Deadlock",
        description: "The requested Deadlock hero could not be found.",
        path: "/heroes",
      });
    }
    const { heroName, slug, cardImage } = loaderData;
    const url = `${SITE_URL}/heroes/${slug}`;
    return seo({
      title: `${heroName} Win Rate & Pick Rate — Deadlock`,
      description: `${heroName} win rate, pick rate, best items, and matchups in Deadlock. Live stats from tracked ranked matches, updated daily.`,
      path: `/heroes/${slug}`,
      ogImage: cardImage ?? undefined,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: `${heroName} Win Rate & Pick Rate — Deadlock`,
          description: `Win rate, pick rate, ban rate, and matchup statistics for ${heroName} in Deadlock, calculated from tracked ranked matches and updated daily.`,
          url,
          keywords: ["Deadlock", heroName, "win rate", "pick rate", "matchups"],
          creator: { "@type": "Organization", name: "Deadlock API", url: SITE_URL },
          isAccessibleForFree: true,
          license: "https://github.com/deadlock-api/",
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Heroes", item: `${SITE_URL}/heroes` },
            { "@type": "ListItem", position: 3, name: heroName, item: url },
          ],
        },
      ],
    });
  },
});

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function HeroDetailPage() {
  const { heroId, heroName } = Route.useLoaderData();
  const statsQuery = useQuery(heroStatsQueryOptions(currentStatsParams()));
  const banQuery = useQuery(heroBanStatsQueryOptions(currentBanParams()));

  const summary = useMemo(() => {
    const rows = statsQuery.data;
    if (!rows || rows.length === 0) return null;
    const row = rows.find((r) => r.hero_id === heroId);
    if (!row || row.matches === 0) return null;
    let sumMatches = 0;
    for (const r of rows) sumMatches += r.matches;
    const winRate = row.wins / row.matches;
    const pickRate = sumMatches > 0 ? getPickrateMultiplier(GAME_MODE) * (row.matches / sumMatches) : 0;
    const banRate = banQuery.data ? computeBanRates(banQuery.data).get(heroId) : undefined;
    return { winRate, pickRate, matches: row.matches, banRate };
  }, [statsQuery.data, banQuery.data, heroId]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Heroes", href: "/heroes" }, { label: heroName }]} />

      <div className="flex items-center gap-3">
        <HeroImage heroId={heroId} className="size-12" />
        <h1 className="text-3xl font-bold tracking-tight">{heroName} — Deadlock Win Rate &amp; Pick Rate</h1>
      </div>

      {summary ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          In the current patch, {heroName} holds a{" "}
          <span className="font-semibold text-foreground">{pct(summary.winRate)}</span> win rate across{" "}
          <span className="font-semibold text-foreground">{summary.matches.toLocaleString()}</span> tracked ranked
          matches, with a <span className="font-semibold text-foreground">{pct(summary.pickRate)}</span> pick rate
          {summary.banRate !== undefined && (
            <>
              {" "}
              and a <span className="font-semibold text-foreground">{pct(summary.banRate)}</span> ban rate
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
          <StatCard label="Win Rate" value={pct(summary.winRate)} />
          <StatCard label="Pick Rate" value={pct(summary.pickRate)} />
          <StatCard label="Matches" value={summary.matches.toLocaleString()} />
          <StatCard label="Ban Rate" value={summary.banRate !== undefined ? pct(summary.banRate) : "—"} />
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{heroName} Matchups & Synergies</h2>
        <p className="text-sm text-muted-foreground">
          Which heroes {heroName} counters, which heroes counter {heroName}, and the best teammates to pair with.
        </p>
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingLogo />}>
            <div className="grid gap-4 lg:grid-cols-2">
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={0}
                minRankId={DEFAULT_MIN_RANK}
                maxRankId={DEFAULT_MAX_RANK}
                minDate={DEFAULT_DATE_RANGE[0]}
                maxDate={DEFAULT_DATE_RANGE[1]}
                prevMinDate={DEFAULT_PREV_DATE_RANGE[0]}
                prevMaxDate={DEFAULT_PREV_DATE_RANGE[1]}
                gameMode={GAME_MODE}
              />
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={1}
                minRankId={DEFAULT_MIN_RANK}
                maxRankId={DEFAULT_MAX_RANK}
                minDate={DEFAULT_DATE_RANGE[0]}
                maxDate={DEFAULT_DATE_RANGE[1]}
                prevMinDate={DEFAULT_PREV_DATE_RANGE[0]}
                prevMaxDate={DEFAULT_PREV_DATE_RANGE[1]}
                gameMode={GAME_MODE}
              />
            </div>
          </Suspense>
        </ChunkErrorBoundary>
      </section>

      <nav className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        <Link to="/heroes" preload="intent" className="font-medium text-primary underline underline-offset-4">
          All hero win rates
        </Link>
        <Link to="/leaderboard" preload="intent" className="font-medium text-primary underline underline-offset-4">
          Player leaderboard
        </Link>
      </nav>
    </div>
  );
}
