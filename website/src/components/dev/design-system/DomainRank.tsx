import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Customized, ReferenceLine, XAxis, YAxis } from "recharts";

import { Specimen } from "~/components/dev/design-system/Specimen";
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
    };
  });
  const namedTiers = tiers.slice(0, 5).map(({ tier, winRate, name, color }) => ({ tier, winRate, name, color }));

  return (
    <>
      <Specimen
        name="RankTierIcons"
        source="domain/rank/RankTierIcons"
        note="For a chart with one bar per badge (tier * 10 + subtier): draws each tier's badge once, centred under its subtier bars. Render it through <Customized> and give the XAxis a height of RANK_ICON_AXIS_HEIGHT."
      >
        <ChartSurface label="Players by rank badge" size="md">
          <BarChart data={PLAYERS_BY_BADGE} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_X_AXIS} dataKey="badge" tick={false} height={RANK_ICON_AXIS_HEIGHT} />
            <YAxis {...CHART_Y_AXIS} />
            <Bar dataKey="players" radius={2} isAnimationActive={false}>
              {PLAYERS_BY_BADGE.map((entry) => (
                <Cell key={entry.badge} fill={rankByTier.get(entry.tier)?.color ?? CHART_COLOR.fallback} />
              ))}
            </Bar>
            <Customized component={<RankTierIcons tiers={TIER_SPANS} ranks={rankByTier} />} />
          </BarChart>
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
            <Bar dataKey={(entry: (typeof tiers)[number]) => [0.5, entry.winRate]} radius={4} isAnimationActive={false}>
              {tiers.map((entry) => (
                <Cell key={entry.tier} fill={entry.color} />
              ))}
            </Bar>
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
            >
              {namedTiers.map((entry) => (
                <Cell key={entry.tier} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ChartSurface>
      </Specimen>
    </>
  );
}
