import type { Rank } from "deadlock_api_client";

import { RankTierTick } from "~/components/domain/rank/RankTierTick";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { formatPercent } from "~/lib/format";

/** One rank tier's bar: the rank's name, color and badge, and the subject's win rate there. */
export interface RankTierWinRate {
  tier: number;
  name: string;
  color: string;
  image?: string;
  winRate: number;
  matches: number;
  /** Shown in the tooltip when given. */
  pickRate?: number;
}

/** The name, color and badge of `tier`, from the assets API's rank (a plain "Tier 3" in the brand color without). */
export function rankTierLook(
  tier: number,
  rank: Rank | undefined,
): Pick<RankTierWinRate, "tier" | "name" | "color" | "image"> {
  return {
    tier,
    name: rank?.name ?? `Tier ${tier}`,
    color: rank?.color ?? CHART_COLOR.primary,
    image: rank?.images.large_webp ?? rank?.images.large ?? undefined,
  };
}

function TierTooltip({ entry }: { entry?: RankTierWinRate }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader leading={entry.image && <img src={entry.image} alt="" className="size-6" />} title={entry.name} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        {entry.pickRate !== undefined && <TooltipStat label="Pick rate" value={formatPercent(entry.pickRate)} />}
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </TooltipCard>
  );
}

/**
 * "Win Rate by Rank": one bar per rank tier, badges on the axis, and a footer naming the best and worst tier. The
 * feature fetches and builds `tiers` (with `rankTierLook`); `status` is its query's.
 */
export function RankTierWinRateChart({
  tiers,
  subject,
  label,
  status = "success",
  onRetry,
  retrying = false,
  minTiers = 1,
  emptyLabel = "rank tiers with enough matches",
  ...props
}: Omit<React.ComponentProps<typeof ChartCard>, "title" | "children" | "footer"> & {
  tiers: readonly RankTierWinRate[];
  /** Who wins, with its verb, to open the footer: "Haze wins", "Buyers win". */
  subject: string;
  /** Names the plot for screen readers: "Haze win rate by rank tier". */
  label: string;
  status?: "pending" | "error" | "success";
  onRetry?: () => void;
  retrying?: boolean;
  /** Fewer tiers than this show the empty state; a single tier has no best and worst. */
  minTiers?: number;
  /** What there is not enough of: "rank tiers with enough purchases". */
  emptyLabel?: string;
}) {
  const enough = tiers.length >= Math.max(1, minTiers);
  const best = enough ? tiers.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : undefined;
  const worst = enough ? tiers.reduce((a, b) => (b.winRate < a.winRate ? b : a)) : undefined;
  const hoverHint = tiers.some((tier) => tier.pickRate !== undefined) ? "pick rate and matches" : "matches";

  return (
    <ChartCard
      title="Win Rate by Rank"
      footer={
        status === "success" &&
        best &&
        worst && (
          <>
            {subject} most at {best.name} ({formatPercent(best.winRate)}) and least at {worst.name} (
            {formatPercent(worst.winRate)}). Hover a bar for {hoverHint}.
          </>
        )
      }
      {...props}
    >
      <PanelBody size="sm">
        {status === "error" ? (
          <ChartError label="win rate by rank" retrying={retrying} onRetry={onRetry} />
        ) : status === "pending" ? (
          <ChartLoading label={label} />
        ) : !enough ? (
          <ChartEmpty label={emptyLabel} />
        ) : (
          <WinRateBarChart
            variant="flush"
            label={label}
            data={[...tiers]}
            xKey="tier"
            valueKey="winRate"
            colorKey="color"
            xAxisHeight={48}
            xTick={<RankTierTick tiers={tiers} />}
            tooltip={<TierTooltip />}
          />
        )}
      </PanelBody>
    </ChartCard>
  );
}
