import { Bookmark } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useSavedMatches } from "~/hooks/useSavedMatches";
import { cn } from "~/lib/utils";

export function SaveMatchButton({ accountId, matchId }: { accountId: number; matchId: number }) {
  const { savedIds, toggleSaved } = useSavedMatches(accountId);
  const saved = savedIds.includes(matchId);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={saved ? "Remove match from saved matches" : "Save match for later"}
      aria-pressed={saved}
      title={saved ? "Saved on this browser · click to remove" : "Save match on this browser"}
      onClick={() => toggleSaved(matchId)}
    >
      <Bookmark className={cn(saved && "text-warning")} fill={saved ? "currentColor" : "none"} />
    </Button>
  );
}
