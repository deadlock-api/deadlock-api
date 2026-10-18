import { THEME_STYLES } from "~/constants/streamkit/widget";
import { cn } from "~/lib/utils";

import type { MatchItemProps } from "./MatchItem.types";

/**
 * One match of the strip. A win is the full-color portrait over a full-width bar; a loss is a faded, grey portrait
 * over a short bar, so the result reads without telling red from green.
 */
export const MatchItem = ({ match, heroImage, theme }: MatchItemProps) => {
  const isWin = match.match_result === match.player_team;

  return (
    <div className={cn("relative w-8 min-w-8 text-center", THEME_STYLES[theme][isWin ? "win" : "loss"])}>
      <img
        src={heroImage}
        alt={`Match ${isWin ? "Win" : "Loss"}`}
        width={24}
        height={32}
        className={cn("mx-auto h-8 w-6 rounded-[2px] object-cover object-top", !isWin && "opacity-60 grayscale")}
      />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-current to-transparent opacity-20" />
      <div className={cn("absolute bottom-0 h-[3px] bg-current", isWin ? "inset-x-0" : "inset-x-2.5")} />
    </div>
  );
};
