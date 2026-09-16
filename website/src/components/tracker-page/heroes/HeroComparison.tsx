import { useHeroById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { TooltipHeader, TooltipStat, TooltipStats } from "../shared/PanelTooltipContent";
import { TrackerDetailPopover } from "../shared/TrackerDetailPopover";

/** Compact comparison with the same explanation on hover, tap, and keyboard activation. */
export function HeroComparison({
  heroId,
  metric,
  playerValue,
  averageValue,
  bracketLabel,
  showAlways,
}: {
  heroId: number;
  metric: "winrate" | "kda";
  playerValue: number;
  averageValue: number;
  bracketLabel: string;
  showAlways: boolean;
}) {
  const { hero } = useHeroById(heroId);
  const isWinrate = metric === "winrate";
  const value = (playerValue - averageValue) * (isWinrate ? 100 : 1);
  const digits = isWinrate ? 1 : 2;
  if (!Number.isFinite(value) || Math.abs(value) < 0.5 * 10 ** -digits) return null;
  const metricLabel = isWinrate ? "Win rate" : "KDA";
  const difference = `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}${isWinrate ? " pp" : ""}`;
  const format = (number: number) => (isWinrate ? `${(number * 100).toFixed(1)}%` : number.toFixed(2));

  return (
    <TrackerDetailPopover
      label={`${hero?.name ?? "Hero"} ${metricLabel.toLowerCase()} comparison`}
      size="xs"
      className={cn("-mx-1 px-1", !showAlways && "hidden @lg:inline-flex")}
      details={
        <>
          <TooltipHeader title={hero?.name ?? "Hero comparison"} subtitle={`${metricLabel} comparison`} />
          <TooltipStats>
            <TooltipStat label="Your average" value={format(playerValue)} />
            <TooltipStat label={`${bracketLabel} average`} value={format(averageValue)} />
            <TooltipStat
              label="Difference"
              value={difference}
              className={value > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS}
            />
          </TooltipStats>
          <p className="text-xs text-muted-foreground">
            Same hero, mode and selected date range. Both wins and losses are included.
          </p>
          <p className="text-xs text-muted-foreground">
            {isWinrate
              ? "pp means percentage points: the difference between the two win rates."
              : "KDA is total kills plus assists divided by total deaths. With no deaths, kills plus assists are shown."}
          </p>
        </>
      }
    >
      <span className={value > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS}>{difference}</span>
    </TrackerDetailPopover>
  );
}
