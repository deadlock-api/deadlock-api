import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { HeroImage } from "~/components/HeroImage";
import { DEFAULT_MATCH_MODE } from "~/components/selectors/MatchModeSelector";
import { Skeleton } from "~/components/ui/skeleton";
import { useHeroById } from "~/hooks/useAssetById";
import { useSeasons } from "~/hooks/useSeasons";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
import { heroSlug } from "~/lib/hero-slug";
import { defaultUnixRange } from "~/lib/seasons";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

const TOP_COUNT = 6;
const GAME_MODE = "normal" as const;

interface TopHero {
  heroId: number;
  winRate: number;
  pickRate: number;
}

const CARD_HEIGHT = "h-[164px]";

function TopHeroCard({ hero: { heroId, winRate, pickRate }, rank }: { hero: TopHero; rank: number }) {
  const { hero } = useHeroById(heroId);
  if (!hero) return <Skeleton className={`${CARD_HEIGHT} rounded-xl`} />;
  return (
    <Link
      to="/heroes/$heroName"
      params={{ heroName: heroSlug(hero.name) }}
      preload="intent"
      className={`flex ${CARD_HEIGHT} flex-col items-center gap-1 rounded-xl border border-border bg-card px-3 py-4 text-center transition-colors hover:border-primary/30 hover:bg-muted/30`}
    >
      <span className="text-xs font-medium text-muted-foreground tabular-nums">#{rank}</span>
      <HeroImage heroId={heroId} className="size-12" />
      <span className="text-sm leading-tight font-medium">{hero.name}</span>
      <span className="text-lg font-bold tabular-nums">{formatPercent(winRate)}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{formatPercent(pickRate)} pick rate</span>
    </Link>
  );
}

export function TopHeroesThisSeason() {
  const { seasons, isPending: seasonsPending } = useSeasons();
  // Mirrors the hero pages' default request so navigating to one reuses this cache entry.
  const statsQuery = useQuery({
    ...heroStatsQueryOptions({
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
      minAverageBadge: 91,
      maxAverageBadge: 116,
      gameMode: GAME_MODE,
      matchMode: DEFAULT_MATCH_MODE,
      ...defaultUnixRange(seasons),
    }),
    enabled: !seasonsPending,
  });

  if (statsQuery.isError) return null;

  let top: TopHero[] | undefined;
  if (statsQuery.data) {
    const total = statsQuery.data.reduce((sum, row) => sum + row.matches, 0);
    top = statsQuery.data
      .filter((row) => row.matches > 0)
      .map((row) => ({
        heroId: row.hero_id,
        winRate: row.wins / row.matches,
        pickRate: (getPickrateMultiplier(GAME_MODE) * row.matches) / total,
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, TOP_COUNT);
  }
  if (top?.length === 0) return null;

  return (
    <section>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Top Heroes This Season</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The highest win rates in Phantom+ ranked matches, refreshed daily
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {top
          ? top.map((hero, index) => (
              <li key={hero.heroId}>
                <TopHeroCard hero={hero} rank={index + 1} />
              </li>
            ))
          : Array.from({ length: TOP_COUNT }, (_, index) => (
              <li key={index}>
                <Skeleton className={`${CARD_HEIGHT} rounded-xl`} />
              </li>
            ))}
      </ol>
      <div className="mt-4 text-center">
        <Link
          to="/heroes"
          preload="intent"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          All hero win rates
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
