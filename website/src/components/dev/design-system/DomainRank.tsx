import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Specimen } from "~/components/dev/design-system/Specimen";
import { RANK_BADGE_AXIS_WIDTH, RankBadgeTick } from "~/components/domain/rank/RankBadgeTick";
import { RANK_ICON_AXIS_HEIGHT, RankTierIcons } from "~/components/domain/rank/RankTierIcons";
import { RankTierTick } from "~/components/domain/rank/RankTierTick";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_COLOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { ranksQueryOptions } from "~/queries/ranks-query";

/** Initiate through Eternus; Obscurus (tier 0) is the unranked badge. */
const TIERS = Array.from({ length: 11 }, (_, i) => i + 1);
const SUBTIERS = [1, 2, 3, 4, 5, 6];

const PLAYERS_BY_BADGE = TIERS.flatMap((tier) =>
  SUBTIERS.map((subtier) => ({
    badge: tier * 10 + subtier,
    tier,
    players: Math.round(9000 * Math.exp(-(((tier - 1) * 6 + subtier - 30) ** 2) / 320)),
  })),
);
const TIER_SPANS: React.ComponentProps<typeof RankTierIcons>["tiers"] = TIERS.map((tier) => ({
  tier,
  firstBadge: tier * 10 + 1,
  lastBadge: tier * 10 + 6,
}));
const WIN_RATE_BY_TIER = TIERS.map((tier) => ({ tier, winRate: 0.468 + tier * 0.006 + (tier % 3) * 0.003 }));
const WIN_RATE_AXIS = winRateDomain([0.5, ...WIN_RATE_BY_TIER.map((entry) => entry.winRate)]);
/** Two players' linearised ranks (`badgeToLinear`) over twelve days; null is a day off the line. */
const RANK_LINES = [31, 32, 32, 33, 35, 34, 36, 37, 37, 38, 39, 40].map((a, i) => ({
  day: i + 1,
  a,
  b: i < 3 || i > 8 ? 42 - Math.floor(i / 4) : null,
}));
const RANK_TICKS = [31, 37, 43];
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function DomainRank() {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const rankByTier = new Map(ranks?.map((rank) => [rank.tier, rank]));
  const tiers = WIN_RATE_BY_TIER.map(({ tier, winRate }) => {
    const rank = rankByTier.get(tier);
    return {
      tier,
      winRate,
      name: rank?.name ?? `Tier ${tier}`,
      image: rank?.images.large_webp ?? rank?.images.large ?? undefined,
      color: rank?.color ?? CHART_COLOR.fallback,
      // Recharts colours each bar from its data point's `fill`.
      fill: rank?.color ?? CHART_COLOR.fallback,
    };
  });
  const namedTiers = tiers
    .slice(0, 5)
    .map(({ tier, winRate, name, color, fill }) => ({ tier, winRate, name, color, fill }));
  const playersByBadge = PLAYERS_BY_BADGE.map(({ badge, tier, players }) => ({
    badge,
    tier,
    players,
    fill: rankByTier.get(tier)?.color ?? CHART_COLOR.fallback,
  }));

  return (
    <>
      <Specimen
        name="RankTierIcons"
        source="domain/rank/RankTierIcons"
        note="For a chart with one bar per badge (tier * 10 + subtier): draws each tier's badge once, centred under its subtier bars. Render it as a direct child of the chart and give the XAxis a height of RANK_ICON_AXIS_HEIGHT."
      >
        <ChartSurface label="Players by rank badge" size="md">
          <BarChart data={playersByBadge} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_X_AXIS} dataKey="badge" tick={false} height={RANK_ICON_AXIS_HEIGHT} />
            <YAxis {...CHART_Y_AXIS} />
            <Bar dataKey="players" radius={2} isAnimationActive={false} />
            <RankTierIcons tiers={TIER_SPANS} ranks={rankByTier} />
          </BarChart>
        </ChartSurface>
      </Specimen>

      <Specimen
        name="RankBadgeTick"
        source="domain/rank/RankBadgeTick"
        note="The y-axis tick of a chart plotted on linearised badges (badgeToLinear): the subtier's badge, named in its title, or its short number while the ranks load. Give the YAxis width={RANK_BADGE_AXIS_WIDTH} and ticks at tier starts (rankAxis in ~/lib/compare-rank-history)."
        className="grid gap-3 lg:grid-cols-2"
      >
        <ChartSurface label="Two players' ranks over twelve days, RankBadgeTick on the y axis" size="md">
          <LineChart data={RANK_LINES} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_X_AXIS} dataKey="day" type="number" domain={[1, 12]} />
            <YAxis
              {...CHART_Y_AXIS}
              width={RANK_BADGE_AXIS_WIDTH}
              domain={[30, 44]}
              ticks={RANK_TICKS}
              interval={0}
              tick={<RankBadgeTick ranks={ranks} />}
            />
            <Line
              dataKey="a"
              type="stepAfter"
              stroke={SERIES_COLORS[0]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="b"
              type="stepAfter"
              stroke={SERIES_COLORS[1]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartSurface>
        <ChartSurface label="Ranks inside one tier while the ranks load, RankBadgeTick as short numbers" size="md">
          <LineChart data={RANK_LINES.slice(0, 4)} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_X_AXIS} dataKey="day" type="number" domain={[1, 4]} />
            <YAxis
              {...CHART_Y_AXIS}
              width={RANK_BADGE_AXIS_WIDTH}
              domain={[30, 34]}
              ticks={[30, 31, 32, 33, 34]}
              interval={0}
              tick={<RankBadgeTick ranks={undefined} />}
            />
            <Line
              dataKey="a"
              type="stepAfter"
              stroke={SERIES_COLORS[0]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartSurface>
      </Specimen>

      <Specimen
        name="RankTierTick"
        source="domain/rank/RankTierTick"
        note="The x-axis tick of a chart with one bar or point per rank tier: the tier's badge, or its name when it has no image. The badges shrink to the chart's width."
        className="grid gap-3 lg:grid-cols-2"
      >
        <ChartSurface label="Win rate by rank tier, RankTierTick sized from the chart" size="md">
          <BarChart data={tiers} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_X_AXIS} dataKey="tier" interval={0} height={48} tick={<RankTierTick tiers={tiers} />} />
            <YAxis
              {...CHART_Y_AXIS}
              domain={WIN_RATE_AXIS}
              ticks={percentTicks(WIN_RATE_AXIS)}
              tickFormatter={percent}
            />
            <ReferenceLine y={0.5} {...CHART_BASELINE} />
            <Bar
              dataKey={(entry: (typeof tiers)[number]) => [0.5, entry.winRate]}
              radius={4}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartSurface>
        <ChartSurface label="Win rate by rank tier, RankTierTick without badge images" size="md">
          <BarChart data={namedTiers} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              {...CHART_X_AXIS}
              dataKey="tier"
              interval={0}
              height={32}
              tick={<RankTierTick tiers={namedTiers} />}
            />
            <YAxis
              {...CHART_Y_AXIS}
              domain={WIN_RATE_AXIS}
              ticks={percentTicks(WIN_RATE_AXIS)}
              tickFormatter={percent}
            />
            <ReferenceLine y={0.5} {...CHART_BASELINE} />
            <Bar
              dataKey={(entry: (typeof namedTiers)[number]) => [0.5, entry.winRate]}
              radius={4}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartSurface>
      </Specimen>
    </>
  );
}
