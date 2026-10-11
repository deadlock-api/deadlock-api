import type { Rank } from "deadlock_api_client";

import { badgeLabel } from "~/lib/rank-utils";
import type { MatchSummary } from "~/queries/tracker-queries";

import { badgeToLinear, linearToBadge } from "./compute";
import { TEAMS } from "./teams";

/** A match as its link preview tells it: who won, the score, how long, how high. */
export interface MatchShare {
  /** The winning side's index in `TEAMS`, or null when the match has no recorded winner. */
  winner: 0 | 1 | null;
  /** Kills per side, or Street Brawl's round score. */
  score: [number, number];
  scoreUnit: "kills" | "rounds";
  minutes: number;
  /** "Ranked", "Unranked", "Street Brawl" … */
  mode: string;
  /** The match's average rank on the linear scale: from both sides' averages, else from the players'. Null without any. */
  averageBadge: number | null;
}

/** The headline facts of a stored match, the same for its page's description and its share card. */
export function matchShare(summary: MatchSummary): MatchShare {
  const winner = TEAMS.findIndex((team) => team.key === summary.winning_team);
  const kills: [number, number] = [0, 0];
  for (const player of summary.players) {
    const side = TEAMS.findIndex((team) => team.key === player.team);
    if (side === 0 || side === 1) kills[side] += player.kills;
  }
  const ranked = (badge: number | null): badge is number => badge != null && badge > 0;
  const teamBadges = [summary.average_badge_team0, summary.average_badge_team1].filter(ranked);
  // The stored team averages are often empty while each player's rank is there.
  const badges = teamBadges.length > 0 ? teamBadges : summary.players.map((player) => player.rank_badge).filter(ranked);
  const linear = badges.reduce((sum, badge) => sum + badgeToLinear(badge), 0) / Math.max(1, badges.length);
  return {
    winner: winner === 0 || winner === 1 ? winner : null,
    score: summary.team_score ?? kills,
    scoreUnit: summary.team_score ? "rounds" : "kills",
    minutes: Math.max(1, Math.round(summary.duration_s / 60)),
    mode: summary.game_mode === "StreetBrawl" ? "Street Brawl" : summary.match_mode || "Deadlock",
    averageBadge: badges.length > 0 ? linearToBadge(Math.round(linear)) : null,
  };
}

/**
 * The page's title and description from the match itself: "The Hidden King beat The Archmother 45 to 38 kills in 34
 * minutes. Ranked, average rank Oracle 4. …". A link preview then says what happened in the match.
 */
export function matchShareText(matchId: number, summary: MatchSummary, ranks: readonly Rank[] | undefined) {
  const share = matchShare(summary);
  const [first, second] = share.winner === 1 ? [1, 0] : [0, 1];
  const score = `${share.score[first]} to ${share.score[second]} ${share.scoreUnit}`;
  const outcome =
    share.winner === null
      ? `${TEAMS[0].name} and ${TEAMS[1].name}, ${score} in ${share.minutes} minutes.`
      : `${TEAMS[first].name} beat ${TEAMS[second].name} ${score} in ${share.minutes} minutes.`;
  const rank = share.averageBadge ? `, average rank ${badgeLabel(ranks, share.averageBadge)}` : "";
  return {
    title: share.winner === null ? `Deadlock Match ${matchId}` : `Match ${matchId}: ${TEAMS[share.winner].name} Won`,
    description: `${outcome} ${share.mode}${rank}. ${
      share.scoreUnit === "rounds"
        ? "Builds and kills for every player."
        : "Builds, kills and the soul lead for every player."
    }`,
  };
}
