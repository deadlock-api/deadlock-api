import { QueryClient } from "@tanstack/react-query";

import { day } from "~/dayjs";
import { compareFilterSearch } from "~/lib/compare-share";
import { MODE_CONFIG } from "~/lib/game-mode";
import { extractBadgeMap } from "~/lib/leaderboard";
import {
  aggregateHeroStats,
  COMPARE_STATS,
  type CompareStatKey,
  type PlayerAggregate,
  parseCompareIds,
  scoreComparison,
  statWinners,
} from "~/lib/player-compare";
import { formatPlayerMetricValue } from "~/lib/player-metrics";
import { defaultUnixRange } from "~/lib/seasons";
import { heroesQueryOptions, loadSeasons } from "~/queries/asset-queries";
import {
  compareHeroStatsParams,
  compareMetricsParams,
  playerRanksQueryOptions,
  resolveCompareFilters,
  sortedIds,
} from "~/queries/player-compare-queries";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamProfilesQueryOptions } from "~/queries/steam-queries";
import { trackerHeroStatsQueryOptions } from "~/queries/tracker-queries";

import { OG_SERIES } from "./palette";

/** The stats a card shows under each player: the ones people quote, with the label the card prints. */
const HIGHLIGHTS: { key: CompareStatKey; short: string }[] = [
  { key: "winRate", short: "Win rate" },
  { key: "kda", short: "KDA" },
  { key: "netWorthPerMin", short: "Souls/min" },
];

export interface CompareCardPlayer {
  name: string;
  avatar: string | undefined;
  color: string;
  rankName: string | undefined;
  rankImage: string | undefined;
  hasMatches: boolean;
  statsWon: number;
  leader: boolean;
  highlights: { label: string; value: string; best: boolean }[];
}

export interface CompareCardData {
  players: CompareCardPlayer[];
  scoredCount: number;
  /** The logo to draw, when the renderer has it loaded already (a data URI); the card falls back to its URL. */
  logo?: string;
  /** The filters in words: "Bebop", "Ranked", "This season". */
  context: string[];
}

/** The page's filters (the current season for dates), and the dates as the card names them. */
async function resolveFilters(search: URLSearchParams, client: QueryClient) {
  const { filters, mode, range } = await resolveCompareFilters(compareFilterSearch(search), async () =>
    defaultUnixRange(await loadSeasons(client), "season"),
  );
  // An open end is the day the card is drawn, written as that day.
  const dateLabel = range
    ? range[0]
      ? `${range[0].format("MMM D")} – ${(range[1] ?? day()).format("MMM D")}`
      : `Until ${(range[1] ?? day()).format("MMM D")}`
    : "This season";
  return { filters, mode, dateLabel };
}

/** A request the card can draw without: its failure leaves a gap rather than failing the image. */
function settle<T>(promise: Promise<T>): Promise<T | undefined> {
  return promise.catch(() => undefined);
}

/** Everything a comparison card draws, loaded server side with the page's own queries. Null without players. */
export async function loadCompareCardData(search: URLSearchParams): Promise<CompareCardData | null> {
  const accountIds = parseCompareIds((search.get("players") ?? "").split(",").map(Number));
  if (accountIds.length === 0) return null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // What doesn't depend on the filters starts now; the filters may first wait for the seasons.
  const independent = Promise.all([
    settle(client.query(steamProfilesQueryOptions(sortedIds(accountIds)))),
    settle(client.query(playerRanksQueryOptions(accountIds))),
    settle(client.query(ranksQueryOptions)),
    settle(client.query(heroesQueryOptions)),
  ]);
  const { filters, mode, dateLabel } = await resolveFilters(search, client);

  const [rows, metrics, [profiles, playerRanks, ranks, heroes]] = await Promise.all([
    settle(client.query(trackerHeroStatsQueryOptions(compareHeroStatsParams(accountIds, filters)))),
    Promise.all(
      accountIds.map((id) => settle(client.query(playerStatsMetricsQueryOptions(compareMetricsParams(filters, id))))),
    ),
    independent,
  ]);
  const badgeMap = extractBadgeMap(ranks ?? []);

  const aggregates: (PlayerAggregate | null)[] = accountIds.map((accountId, index) => {
    const aggregate = aggregateHeroStats(rows ?? [], accountId);
    if (!aggregate) return null;
    const badge = playerRanks?.find((rank) => rank.account_id === accountId)?.badge;
    return {
      ...aggregate,
      // A failed lookup is no value rather than loading: the card cannot wait.
      rankBadge: badge || null,
      healingPerMin: metrics[index]?.healing_per_min?.avg ?? null,
      healPreventedPerMatch: metrics[index]?.heal_prevented?.avg ?? null,
    };
  });
  const { scored, tally, leaders } = scoreComparison(aggregates);

  const players = accountIds.map((accountId, index): CompareCardPlayer => {
    const aggregate = aggregates[index];
    const rank = aggregate?.rankBadge ? badgeMap.get(aggregate.rankBadge) : undefined;
    const profile = profiles?.[accountId];
    return {
      name: profile?.personaname ?? `Player ${accountId}`,
      avatar: profile?.avatarfull || profile?.avatar,
      color: OG_SERIES[index % OG_SERIES.length],
      rankName: rank ? `${rank.name} ${rank.subtier}` : undefined,
      // The tier's badge straight from the assets CDN; the per-subrank images are served through the API.
      rankImage: aggregate?.rankBadge
        ? (ranks?.find((entry) => entry.tier === Math.floor(aggregate.rankBadge! / 10))?.images.large ?? undefined)
        : undefined,
      hasMatches: aggregate != null,
      statsWon: tally[index],
      leader: leaders.includes(index),
      highlights: HIGHLIGHTS.map(({ key, short }) => {
        const stat = COMPARE_STATS.find((entry) => entry.key === key)!;
        const value = aggregate?.[key];
        return {
          label: short,
          value: value == null || stat.format === "rank" ? "–" : formatPlayerMetricValue(value, stat.format),
          best: statWinners(
            aggregates.map((entry) => entry?.[key]),
            stat.polarity,
          ).includes(index),
        };
      }),
    };
  });

  const hero = filters.heroId != null ? heroes?.find((entry) => entry.id === filters.heroId) : undefined;
  return {
    players,
    scoredCount: scored.length,
    context: [hero?.name ?? "All heroes", ...(mode === "normal_all" ? [] : [MODE_CONFIG[mode].label]), dateLabel],
  };
}
