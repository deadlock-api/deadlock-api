import { useMatchHistory } from "~/hooks/streamkit/useMatchHistory";
import { cn } from "~/lib/utils";

import type { MatchHistoryProps } from "./MatchHistory.types";
import { MatchItem } from "./MatchItem";

export const MatchHistory = ({
  theme,
  numMatches = 10,
  accountId,
  pending = false,
  opacity = 100,
}: MatchHistoryProps) => {
  const { matches, heroes, loading } = useMatchHistory({
    accountId,
    numMatches,
  });

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
  if (loading || pending) return <div style={style} className={stripClasses} />;
  if (!matches || matches.length === 0) return null;
  if (!heroes || heroes.size === 0) return null;

  const shown = matches.flatMap((match) => {
    const hero = heroes.get(match.hero_id);
    return hero ? [{ match, hero }] : [];
  });
  const wins = shown.filter(({ match }) => match.match_result === match.player_team).length;

  // A list, so a screen reader hears how many matches, in which order, and the tally before the items.
  return (
    <ol
      style={style}
      className={stripClasses}
      aria-label={`Last ${shown.length} ${shown.length === 1 ? "match" : "matches"}, newest first: ${wins}W ${shown.length - wins}L`}
    >
      {shown.map(({ match, hero }) => (
        <MatchItem key={match.match_id} match={match} hero={hero} theme={theme} />
      ))}
    </ol>
  );
};
