import { THEME_STYLES } from "~/constants/streamkit/widget";
import { playerResult } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import type { MatchItemProps } from "./MatchItem.types";

const RESULT_WORD = { win: "Win", loss: "Loss", not_scored: "Not scored" } as const;

/**
 * One match of the strip. A win is the full-color portrait over a full-width bar; a loss is a faded, grey portrait
 * over a short bar; a match that did not count is a faded portrait without a bar. So the result reads without telling
 * red from green.
 */
export const MatchItem = ({ match, hero, theme }: MatchItemProps) => {
  const result = playerResult(match);

  return (
    <li className={cn("relative w-8 min-w-8 text-center", THEME_STYLES[theme][result])}>
      <img
        src={hero.image}
        alt={`${RESULT_WORD[result]} as ${hero.name}`}
        width={24}
        height={32}
        className={cn(
          "mx-auto h-8 w-6 rounded-[2px] object-cover object-top",
          result !== "win" && "opacity-60 grayscale",
        )}
      />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-current to-transparent opacity-20" />
      {result !== "not_scored" && (
        <div className={cn("absolute bottom-0 h-[3px] bg-current", result === "win" ? "inset-x-0" : "inset-x-2.5")} />
      )}
    </li>
  );
};
