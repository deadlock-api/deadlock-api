import type { Rank } from "deadlock_api_client";
import { useEffect } from "react";

import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { Card, CardContent } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { ImgWithSkeleton } from "~/components/ui/img-with-skeleton";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { formatPercent } from "~/lib/format";
import type { DailyRound } from "~/lib/guess-the-rank/daily";
import {
  distanceLabel,
  MAX_ROUND_POINTS,
  roundPoints,
  subtierOfBadge,
  tierDistance,
  tierOfBadge,
} from "~/lib/guess-the-rank/scoring";
import { badgeLabel, getRankImageUrl } from "~/lib/rank-utils";

import { trackGuessTheRank } from "./analytics";
import type { RankTier } from "./RankPicker";
import { type GuessedRound, useRoundResult } from "./use-guess-the-rank";
import { VoteDistributionChart } from "./VoteDistributionChart";

// Partial credit stays neutral: only a miss and an exact guess carry a verdict color, beside the signed number.
const POINT_TONE = { 0: "negative", 1: "muted", 2: "muted", 3: "positive" } as const;

/**
 * A guessed round's answer: the player's actual badge, how far off the guess was and its points, then how everyone
 * else guessed (read fresh from the server, so the numbers keep growing during the day).
 */
export function RoundReveal({
  date,
  round,
  guessed,
  ranks,
  tiers,
}: {
  date: string;
  round: DailyRound;
  guessed: GuessedRound;
  ranks: readonly Rank[];
  tiers: readonly RankTier[];
}) {
  const result = useRoundResult(date, round, true);
  useEffect(() => {
    if (result.isError) {
      trackGuessTheRank("error", { date, round: round.round, video_id: round.videoId, kind: "result_load" });
    }
  }, [result.isError, date, round]);
  const actualTier = tierOfBadge(guessed.badge);
  const rank = ranks.find((entry) => entry.tier === actualTier);
  const image = getRankImageUrl(rank, "webp", subtierOfBadge(guessed.badge));
  const distance = tierDistance(guessed.guess, actualTier);
  const points = roundPoints(guessed.guess, actualTier);
  const guessName = ranks.find((entry) => entry.tier === guessed.guess)?.name ?? `Tier ${guessed.guess}`;
  const stats = result.data;
  const exactShare = stats && stats.total > 0 ? (stats.stats[actualTier] ?? 0) / stats.total : undefined;

  return (
    <Card size="sm">
      <CardContent>
        <Stack gap={4}>
          <div className="flex items-center gap-4">
            {image && <ImgWithSkeleton src={image} alt="" className="size-20 shrink-0 object-contain" />}
            <Stack gap={1}>
              <Text variant="eyebrow" tone="muted">
                The player was
              </Text>
              <Heading as="h3" size="lg" className="font-game font-normal uppercase">
                {badgeLabel(ranks, guessed.badge)}
              </Heading>
              <Text variant="caption" tone="muted">
                You guessed {guessName}: {distanceLabel(distance)}
              </Text>
            </Stack>
          </div>

          <StatGroup size="sm" className="grid-cols-3 font-mono">
            <Stat
              label="Points"
              value={`+${points}`}
              sub={`of ${MAX_ROUND_POINTS}`}
              tone={POINT_TONE[points as keyof typeof POINT_TONE]}
            />
            <Stat label="Guesses" value={stats ? stats.total.toLocaleString("en-US") : undefined} />
            <Stat label="Exact" value={exactShare === undefined ? undefined : formatPercent(exactShare, 0)} />
          </StatGroup>

          {result.isPending ? (
            <ChartLoading label="community guesses" size="md" />
          ) : result.isError ? (
            <ChartError label="community guesses" onRetry={() => void result.refetch()} retrying={result.isFetching} />
          ) : !stats || stats.total === 0 ? (
            <ChartEmpty label="community guesses" />
          ) : (
            <VoteDistributionChart
              tiers={tiers}
              stats={stats.stats}
              total={stats.total}
              actualTier={actualTier}
              guessTier={guessed.guess}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
