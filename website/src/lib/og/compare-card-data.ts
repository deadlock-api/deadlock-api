import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { day } from "~/dayjs";
import { compareFilterSearch } from "~/lib/compare-share";
import { MODE_CONFIG } from "~/lib/game-mode";
import { extractBadgeMap } from "~/lib/leaderboard";
import {
  COMPARE_STATS,
  compareColorIndexes,
  compareStatWinners,
  type CompareStatKey,
  parseCompareIds,
  scoreComparison,
  settledAggregates,
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
  /** Has a stats-won count: matches of their own and at least one opponent with matches to be scored against. */
  scored: boolean;
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
  /** A request the card could draw without failed (a rank, a name, a metric): the card is drawn but not kept long. */
  partial: boolean;
}

/** The page's filters (the current season for dates), and the dates as the card names them. */
async function resolveFilters(search: URLSearchParams, client: QueryClient) {
  // Loaded even when the URL names its dates: the seasons register the exact patch boundaries, without which a
  // pinned season start (a patch instant) rounds down to midnight and the card counts matches the page does not.
  const seasons = await loadSeasons(client);
  const { filters, mode, range } = await resolveCompareFilters(compareFilterSearch(search), async () =>
    defaultUnixRange(seasons, "season"),
  );
  // An open end is the day the card is drawn, written as that day; the years only when the dates span two of them.
  const end = range?.[1] ?? day();
  const dateLabel = range
    ? range[0]
      ? range[0].year() === end.year()
        ? `${range[0].format("MMM D")} – ${end.format("MMM D")}`
        : `${range[0].format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`
      : `Until ${end.format("MMM D")}`
    : "This season";
  return { filters, mode, dateLabel };
}

/** A request the card can draw without: its failure leaves a gap rather than failing the image. */
function settle<T>(promise: Promise<T>, failed: { any: boolean }): Promise<T | undefined> {
  return promise.catch((error: unknown) => {
    // A refusal (a private account's metrics, a missing profile) is the answer and will be again: only a server or
    // network failure makes the card worth drawing again soon.
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status === undefined || status >= 500) failed.any = true;
    return undefined;
  });
}

/** Everything a comparison card draws, loaded server side with the page's own queries. Null without players. */
export async function loadCompareCardData(search: URLSearchParams): Promise<CompareCardData | null> {
  const accountIds = parseCompareIds((search.get("players") ?? "").split(",").map(Number));
  if (accountIds.length === 0) return null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const failed = { any: false };
  // What doesn't depend on the filters starts now; the filters may first wait for the seasons.
  const independent = Promise.all([
    settle(client.query(steamProfilesQueryOptions(sortedIds(accountIds))), failed),
    settle(client.query(playerRanksQueryOptions(accountIds)), failed),
    settle(client.query(ranksQueryOptions), failed),
    settle(client.query(heroesQueryOptions), failed),
  ]);
  const { filters, mode, dateLabel } = await resolveFilters(search, client);

  const [rows, metrics, [profiles, playerRanks, ranks, heroes]] = await Promise.all([
    // Not settled: without the stats every player would read "no matches", a wrong card. The failure reaches the
    // renderer, which draws the promo card and keeps it only briefly.
    client.query(trackerHeroStatsQueryOptions(compareHeroStatsParams(accountIds, filters))),
    Promise.all(
      accountIds.map((id) =>
        settle(client.query(playerStatsMetricsQueryOptions(compareMetricsParams(filters, id))), failed),
      ),
    ),
    independent,
  ]);
  const badgeMap = extractBadgeMap(ranks ?? []);

  // The current rank is the player's, whatever the filters: shown even without matches, as on the page. A failed lookup
  // is no value rather than loading: the card cannot wait. Unranked (badge 0) has no rank.
  const badges = accountIds.map(
    (accountId) => playerRanks?.find((rank) => rank.account_id === accountId)?.badge || null,
  );
  const aggregates = settledAggregates(
    accountIds,
    rows,
    accountIds.map((_, index) => ({ badge: badges[index], metrics: metrics[index] })),
  );
  const { scored, tally, leaders } = scoreComparison(aggregates);

  // The page's colors: each player's by account id, not by column.
  const colorIndexes = compareColorIndexes(accountIds);
  const players = accountIds.map((accountId, index): CompareCardPlayer => {
    const aggregate = aggregates[index];
    const badge = badges[index];
    const rank = badge ? badgeMap.get(badge) : undefined;
    const profile = profiles?.[accountId];
    return {
      name: profile?.personaname ?? `Player ${accountId}`,
      avatar: profile?.avatarfull || profile?.avatar,
      color: OG_SERIES[colorIndexes[index] % OG_SERIES.length],
      rankName: rank ? `${rank.name} ${rank.subtier}` : undefined,
      // The tier's badge straight from the assets CDN; the per-subrank images are served through the API.
      rankImage: badge
        ? (ranks?.find((entry) => entry.tier === Math.floor(badge / 10))?.images.large ?? undefined)
        : undefined,
      hasMatches: aggregate != null,
      scored: aggregate != null && aggregates.filter((entry) => entry !== null).length >= 2,
      statsWon: tally[index],
      leader: leaders.includes(index),
      highlights: HIGHLIGHTS.map(({ key, short }) => {
        const stat = COMPARE_STATS.find((entry) => entry.key === key)!;
        const value = aggregate?.[key];
        return {
          label: short,
          value: value == null || stat.format === "rank" ? "–" : formatPlayerMetricValue(value, stat.format),
          best: compareStatWinners(aggregates, stat).includes(index),
        };
      }),
    };
  });

  const hero = filters.heroId != null ? heroes?.find((entry) => entry.id === filters.heroId) : undefined;
  return {
    players,
    scoredCount: scored.length,
    context: [hero?.name ?? "All heroes", ...(mode === "normal_all" ? [] : [MODE_CONFIG[mode].label]), dateLabel],
    partial: failed.any,
  };
}
