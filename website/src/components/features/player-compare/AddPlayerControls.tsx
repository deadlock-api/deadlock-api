import { TrophyIcon } from "lucide-react";

import { PlayerSearch } from "~/components/domain/player/PlayerSearch";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";
import type { CompareFilters } from "~/queries/player-compare-queries";

import { useTopPlayerSuggestion } from "./useTopPlayerSuggestion";

/**
 * The empty page's call to action: find a player by Steam search, or start from the strongest player on the filters
 * in one click.
 */
export function AddPlayerControls({
  filters,
  accountIds,
  onAdd,
}: {
  filters: CompareFilters;
  accountIds: readonly number[];
  onAdd: (accountId: number) => void;
}) {
  const top = useTopPlayerSuggestion(filters, accountIds);
  return (
    <Inline gap={2} justify="center">
      <PlayerSearch
        label="Search a player"
        align="center"
        disabledAccountIds={accountIds}
        onValueChange={(player) => onAdd(player.accountId)}
      />
      {(top.isPending || top.accountId !== undefined) && (
        <Button
          variant="outline"
          disabled={top.accountId === undefined}
          aria-label={top.name ? `${top.label}: ${top.name}` : top.label}
          onClick={() => top.accountId !== undefined && onAdd(top.accountId)}
        >
          <TrophyIcon aria-hidden="true" />
          {top.label}
        </Button>
      )}
    </Inline>
  );
}
