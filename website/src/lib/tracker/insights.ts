import type {
  OutcomeSplit,
  OutcomeSplits,
  PlaytimeHabits,
  SessionMomentum,
  TrackerHeroRow,
  TrackerSummary,
} from "./compute";

export interface Insight {
  id: string;
  tone: "good" | "bad";
  /** Win rate of the split, already formatted. */
  value: string;
  headline: string;
  /** Portrait to show instead of the tone icon. */
  heroId?: number;
  /** Sample size behind the win rate. */
  detail: string;
  /** Gap to the overall win rate, in points. */
  delta: string;
  score: number;
}

export const MIN_SPLIT_MATCHES = 12;
export const MIN_HERO_MATCHES = 8;
/** Below this the split is noise dressed up as a finding. */
export const MIN_DELTA_POINTS = 5;
const MAX_INSIGHTS = 5;

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Larger samples outrank equally-sized gaps, so a 40-match dip beats a 12-match one. */
function fromSplit(
  id: string,
  split: OutcomeSplit,
  baseline: number,
  minMatches: number,
  headline: (tone: Insight["tone"], label: string) => string,
  heroId?: number,
): Insight | null {
  if (split.matches < minMatches) return null;
  const percent = (split.wins / split.matches) * 100;
  const delta = percent - baseline * 100;
  if (Math.abs(delta) < MIN_DELTA_POINTS) return null;
  const tone = delta > 0 ? "good" : "bad";
  return {
    id,
    tone,
    value: `${percent.toFixed(1)}%`,
    headline: headline(tone, split.label),
    heroId,
    detail: `${split.matches.toLocaleString("en-US")} matches`,
    delta: `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`,
    score: Math.abs(delta) * Math.sqrt(split.matches),
  };
}

/** The strongest deviation within one group, so a single category never floods the list. */
function strongest(candidates: (Insight | null)[]): Insight | null {
  let best: Insight | null = null;
  for (const candidate of candidates) {
    if (candidate && (best === null || candidate.score > best.score)) best = candidate;
  }
  return best;
}

function heroSplits(heroRows: TrackerHeroRow[], baseline: number): (Insight | null)[] {
  const candidates = heroRows.map((row) =>
    fromSplit(
      `hero-${row.heroId}`,
      { label: "", matches: row.matches, wins: row.wins },
      baseline,
      MIN_HERO_MATCHES,
      (tone) => (tone === "good" ? "Higher win rate on this hero" : "Lower win rate on this hero"),
      row.heroId,
    ),
  );
  return [
    strongest(candidates.filter((candidate) => candidate?.tone === "good")),
    strongest(candidates.filter((candidate) => candidate?.tone === "bad")),
  ];
}

/**
 * The win-rate splits that deviate most from the player's overall rate, ranked and capped so the
 * panel reads as a handful of findings rather than every split the tracker knows how to compute.
 */
export function computeInsights({
  summary,
  heroRows,
  splits,
  momentum,
  habits,
}: {
  summary: TrackerSummary;
  heroRows: TrackerHeroRow[];
  splits: OutcomeSplits;
  momentum: SessionMomentum;
  habits: PlaytimeHabits;
}): Insight[] {
  const baseline = summary.winrate;
  const candidates: (Insight | null)[] = [
    ...heroSplits(heroRows, baseline),
    strongest(
      splits.byDuration.map((split) =>
        fromSplit(`duration-${split.label}`, split, baseline, MIN_SPLIT_MATCHES, (tone, label) =>
          tone === "good" ? `More wins in ${label.toLowerCase()} games` : `Fewer wins in ${label.toLowerCase()} games`,
        ),
      ),
    ),
    strongest(
      splits.bySide.map((split) =>
        fromSplit(`side-${split.label}`, split, baseline, MIN_SPLIT_MATCHES, (tone, label) =>
          tone === "good" ? `Higher win rate on ${label}` : `Lower win rate on ${label}`,
        ),
      ),
    ),
    strongest(
      momentum.byPosition.map((split) =>
        fromSplit(`position-${split.label}`, split, baseline, MIN_SPLIT_MATCHES, (tone, label) =>
          tone === "good"
            ? `Higher win rate: ${label.toLowerCase()} in a session`
            : `Lower win rate: ${label.toLowerCase()} in a session`,
        ),
      ),
    ),
    strongest(
      momentum.byPreviousResult.map((split) =>
        fromSplit(`previous-${split.label}`, split, baseline, MIN_SPLIT_MATCHES, (tone, label) =>
          tone === "good" ? `${label} you win more` : `${label} you win less`,
        ),
      ),
    ),
    habits.bestWeekday
      ? fromSplit(
          "weekday",
          { label: WEEKDAY_NAMES[habits.bestWeekday.weekday], ...habits.bestWeekday },
          baseline,
          MIN_SPLIT_MATCHES,
          (tone, label) => (tone === "good" ? `Higher win rate on ${label}` : `Lower win rate on ${label}`),
        )
      : null,
  ];

  return candidates
    .filter((candidate): candidate is Insight => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_INSIGHTS);
}
