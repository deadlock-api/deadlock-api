import { ChartLegendItem } from "~/components/patterns/charts/ChartLegend";

import type { ComparedPlayer } from "./types";

/** A `ChartLegend`'s item per compared player, in their color, the name truncated to the legend's width. */
export function PlayerLegendItems({
  players,
  shape,
}: {
  players: readonly ComparedPlayer[];
  /** The swatch: `line` for a plot of lines, the default block for bars. */
  shape?: React.ComponentProps<typeof ChartLegendItem>["shape"];
}) {
  return players.map((player) => (
    <ChartLegendItem key={player.accountId} color={player.color} shape={shape} title={player.name}>
      <span className="max-w-full truncate">{player.name}</span>
    </ChartLegendItem>
  ));
}
