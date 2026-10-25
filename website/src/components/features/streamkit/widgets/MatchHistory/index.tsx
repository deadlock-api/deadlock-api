import { cn } from "~/lib/utils";

import type { MatchHistoryProps } from "./MatchHistory.types";
import { MatchItem } from "./MatchItem";

export const MatchHistory = ({ theme, entries, pending = false, opacity = 100 }: MatchHistoryProps) => {
  const stripClasses = cn(
    "flex h-9 items-center justify-start gap-0.5 rounded-t-xl border border-b-0 border-white/[0.03] pt-1",
    theme === "light"
      ? "[background:rgba(255,255,255,var(--bg-opacity))]"
      : theme === "glass"
        ? "bg-white/5"
        : "[background:rgba(26,27,30,var(--bg-opacity))]",
  );
  const style = { "--bg-opacity": opacity / 100 } as React.CSSProperties;

  // The strip's place is kept while the matches load, so the box below does not jump down when they arrive.
  if (pending) return <div style={style} className={stripClasses} />;
  if (entries.length === 0) return null;

  const wins = entries.filter(({ match }) => match.match_result === match.player_team).length;

  // A list, so a screen reader hears how many matches, in which order, and the tally before the items.
  return (
    <ol
      style={style}
      className={stripClasses}
      aria-label={`Last ${entries.length} ${entries.length === 1 ? "match" : "matches"}, newest first: ${wins}W ${entries.length - wins}L`}
    >
      {entries.map(({ match, hero }) => (
        <MatchItem key={match.match_id} match={match} hero={hero} theme={theme} />
      ))}
    </ol>
  );
};
