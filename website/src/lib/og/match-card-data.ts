import { QueryClient } from "@tanstack/react-query";

import { day } from "~/dayjs";
import { badgeLabel } from "~/lib/rank-utils";
import { matchShare } from "~/lib/tracker/match-share";
import { TEAMS } from "~/lib/tracker/teams";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { matchSummaryQueryOptions } from "~/queries/tracker-queries";

export interface MatchCardTeam {
  name: string;
  won: boolean;
  score: number;
  /** One per player in the team's order: the hero's portrait, undefined where it has none. */
  heroes: { key: string; src: string | undefined }[];
}

export interface MatchCardData {
  matchId: number;
  teams: [MatchCardTeam, MatchCardTeam];
  scoreUnit: "kills" | "rounds";
  /** "Ranked", "Oracle 6 average", "34 min", "Oct 11, 2026". */
  facts: string[];
  /** The average rank's badge image, when the match has one. */
  rankImage: string | undefined;
  logo?: string;
}

/** Everything a match card draws, loaded server side with the page's own queries. Null for a match we do not have. */
export async function loadMatchCardData(matchId: number): Promise<MatchCardData | null> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const [summary, heroes, ranks] = await Promise.all([
    client.query(matchSummaryQueryOptions(matchId)),
    client.query(heroesQueryOptions).catch(() => undefined),
    client.query(ranksQueryOptions).catch(() => undefined),
  ]);
  if (!summary) return null;
  const share = matchShare(summary);
  const portrait = (heroId: number) => heroes?.find((hero) => hero.id === heroId)?.images.icon_image_small ?? undefined;
  const team = (index: 0 | 1): MatchCardTeam => ({
    name: TEAMS[index].name,
    won: share.winner === index,
    score: share.score[index],
    heroes: summary.players
      .filter((player) => player.team === TEAMS[index].key)
      .map((p, slot) => ({ key: `${slot}:${p.hero_id}`, src: portrait(p.hero_id) })),
  });
  const badge = share.averageBadge;
  return {
    matchId,
    teams: [team(0), team(1)],
    scoreUnit: share.scoreUnit,
    facts: [
      share.mode,
      ...(badge ? [`${badgeLabel(ranks, badge)} average`] : []),
      `${share.minutes} min`,
      ...(summary.start_time > 0 ? [day.unix(summary.start_time).utc().format("MMM D, YYYY")] : []),
    ],
    rankImage: badge
      ? (ranks?.find((rank) => rank.tier === Math.floor(badge / 10))?.images.large ?? undefined)
      : undefined,
  };
}
