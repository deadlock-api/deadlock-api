import { parseAsArrayOf, parseAsInteger, throttle, useQueryState } from "nuqs";

import { moveItem } from "~/components/ui/hooks/use-reorder";
import { MAX_COMPARE_PLAYERS, parseCompareIds } from "~/lib/player-compare";

/** The players of a comparison, in the URL as `players=1,2,3` so a comparison can be shared as a link. */
export function usePlayerCompareState() {
  const [raw, setRaw] = useQueryState("players", parseAsArrayOf(parseAsInteger).withDefault([]));
  const accountIds = parseCompareIds(raw);
  const write = (next: number[]) =>
    void setRaw(next.length > 0 ? next : null, { history: "push", limitUrlUpdates: throttle(50) });
  return {
    accountIds,
    isFull: accountIds.length >= MAX_COMPARE_PLAYERS,
    add: (accountId: number) => {
      if (accountIds.includes(accountId) || accountIds.length >= MAX_COMPARE_PLAYERS) return;
      write([...accountIds, accountId]);
    },
    remove: (accountId: number) => write(accountIds.filter((id) => id !== accountId)),
    /** The player at `from` goes to `to`: the order sets each player's color and column, and the link keeps it. */
    move: (from: number, to: number) => {
      write(moveItem(accountIds, from, to));
    },
  };
}
