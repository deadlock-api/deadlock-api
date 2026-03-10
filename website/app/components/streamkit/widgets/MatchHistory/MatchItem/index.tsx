import { cn } from "~/lib/utils";

import type { MatchItemProps } from "./MatchItem.types";

export const MatchItem = ({ match, heroImage }: MatchItemProps) => {
  const isWin = match.match_result === match.player_team;

  return (
    <div key={match.match_id} className="relative w-8 min-w-8 text-center">
      <img
        src={heroImage}
        alt={`Match ${isWin ? "Win" : "Loss"}`}
        className="mr-auto ml-auto h-auto w-auto rounded-[2px] object-cover"
        style={{ maxWidth: "80%" }}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-8",
          "bg-gradient-to-t from-current to-transparent opacity-20",
          isWin ? "text-emerald-500" : "text-red-500",
        )}
      />
      <div className={cn("absolute right-0 bottom-0 left-0 h-[3px]", isWin ? "bg-emerald-500" : "bg-red-500")} />
    </div>
  );
};
