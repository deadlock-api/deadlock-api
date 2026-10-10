import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { RankTierTick } from "~/components/domain/rank/RankTierTick";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { Stack } from "~/components/ui/stack";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { niceTicks } from "~/lib/chart-axis";
import { formatPercent } from "~/lib/format";

import type { RankTier } from "./RankPicker";

interface TierVotes extends RankTier {
  votes: number;
  share: number;
  role: "actual" | "guess" | "other";
  /** The bar's colour; Recharts reads it from the data point. */
  fill: string;
}

const ROLE_COLOR = {
  actual: CHART_COLOR.positive,
  guess: CHART_COLOR.primary,
  other: CHART_COLOR.neutral,
} as const;

const ROLE_LABEL = { actual: "Actual rank", guess: "Your guess", other: undefined } as const;

function TierTooltip({ entry }: { entry?: TierVotes }) {
  if (!entry) return null;
  const role = ROLE_LABEL[entry.role];
  return (
    <TooltipCard>
      <TooltipHeader
        leading={entry.image && <img src={entry.image} alt="" className="size-6" />}
        title={role ? `${entry.name} · ${role}` : entry.name}
      />
      <TooltipStats>
        <TooltipStat label="Guesses" value={entry.votes.toLocaleString("en-US")} />
        <TooltipStat label="Share" value={formatPercent(entry.share)} />
      </TooltipStats>
    </TooltipCard>
  );
}

/**
 * How the community guessed one clip: guesses per rank tier, the actual tier in the positive color and the player's
 * guess in the brand color. The legend names both, so color is not the only cue.
 */
export function VoteDistributionChart({
  tiers,
  stats,
  total,
  actualTier,
  guessTier,
}: {
  tiers: readonly RankTier[];
  stats: Readonly<Record<number, number>>;
  total: number;
  actualTier: number;
  guessTier: number;
}) {
  const data: TierVotes[] = tiers.map((tier) => {
    const votes = stats[tier.tier] ?? 0;
    const role = tier.tier === actualTier ? "actual" : tier.tier === guessTier ? "guess" : "other";
    return { ...tier, votes, share: total > 0 ? votes / total : 0, role, fill: ROLE_COLOR[role] };
  });
  const top = data.reduce<TierVotes | undefined>(
    (best, entry) => (!best || entry.votes > best.votes ? entry : best),
    undefined,
  );
  const actual = data.find((entry) => entry.tier === actualTier);
  // At least four steps of one, so a handful of votes still gets whole-number ticks.
  const valueTicks = niceTicks(0, Math.max(4, ...data.map((entry) => entry.votes)));
  const label =
    `Community guesses per rank tier, ${total} in all. ` +
    `${formatPercent(actual?.share ?? 0)} guessed the actual rank, ${actual?.name ?? "unknown"}` +
    (top && top.votes > 0 ? `; the most guessed tier was ${top.name}.` : ".");

  return (
    <Stack gap={2}>
      <ChartSurface label={label} size="md" variant="flush">
        <BarChart data={data} margin={CHART_MARGIN} accessibilityLayer>
          <CartesianGrid {...CHART_GRID} />
          <XAxis {...CHART_X_AXIS} dataKey="tier" interval={0} height={48} tick={<RankTierTick tiers={tiers} />} />
          <YAxis
            {...CHART_Y_AXIS}
            allowDecimals={false}
            ticks={valueTicks}
            domain={[0, valueTicks[valueTicks.length - 1]]}
          />
          <Tooltip
            cursor={CHART_CURSOR_BAND}
            isAnimationActive={false}
            content={({ active, payload }) =>
              active && payload?.length ? <TierTooltip entry={payload[0].payload as TierVotes} /> : null
            }
          />
          <Bar dataKey="votes" radius={4} />
        </BarChart>
      </ChartSurface>
      <ChartLegend label="Bar colors">
        <ChartLegendItem shape="square" color={ROLE_COLOR.actual}>
          Actual rank
        </ChartLegendItem>
        {guessTier !== actualTier && (
          <ChartLegendItem shape="square" color={ROLE_COLOR.guess}>
            Your guess
          </ChartLegendItem>
        )}
        <ChartLegendItem shape="square" color={ROLE_COLOR.other}>
          Other guesses
        </ChartLegendItem>
      </ChartLegend>
    </Stack>
  );
}
