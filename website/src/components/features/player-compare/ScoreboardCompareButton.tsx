import { Link } from "@tanstack/react-router";
import { GitCompareArrows } from "lucide-react";

import { Button } from "~/components/ui/button";
import { COMPARE_FILTER_KEYS } from "~/lib/compare-share";

/**
 * The way from the players picked on the scoreboard into their comparison, for the table's pick column header. It is
 * there (disabled) before anyone is picked, and its label keeps one width, so picking never moves the table.
 */
export function ScoreboardCompareButton({ accountIds }: { accountIds: readonly number[] }) {
  const count = accountIds.length;
  const content = (
    <>
      <GitCompareArrows aria-hidden="true" />
      Compare
      <span className="tabular-nums">{count}</span>
    </>
  );
  if (count === 0) {
    return (
      <Button
        size="xs"
        disabled
        aria-label="Compare picked players (none picked yet)"
        title="Pick players with + to compare them"
      >
        {content}
      </Button>
    );
  }
  return (
    <Button size="xs" asChild>
      <Link
        to="/analytics/players/compare"
        aria-label={count === 1 ? "Compare 1 player" : `Compare ${count} players`}
        // The comparison keeps the board's filters, except rank: it has none.
        search={(prev: Record<string, unknown>) => ({
          ...Object.fromEntries(COMPARE_FILTER_KEYS.map((key) => [key, prev[key]])),
          players: accountIds.join(","),
        })}
      >
        {content}
      </Link>
    </Button>
  );
}
