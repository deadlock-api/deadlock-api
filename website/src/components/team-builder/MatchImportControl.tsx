import { DownloadIcon, HashIcon, Loader2Icon, RepeatIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { FilterPill } from "~/components/FilterPill";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface MatchImportControlProps {
  matchId: number | null;
  isLoading?: boolean;
  error?: string;
  onLoad: (matchId: number) => void;
  onFlipSides: () => void;
  onClear: () => void;
}

/**
 * Loads a real draft into the board. It sits in the filter bar because that is where the control
 * belongs on the page, but it is deliberately not a `Filter.*`: it seeds the draft rather than
 * scoping the stats, so it contributes nothing to the filter sentence.
 */
export function MatchImportControl({
  matchId,
  isLoading,
  error,
  onLoad,
  onFlipSides,
  onClear,
}: MatchImportControlProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const parsed = Number.parseInt(draft.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) onLoad(parsed);
  };

  return (
    <FilterPill
      label="Match"
      value={matchId === null ? "none" : String(matchId)}
      active={matchId !== null}
      icon={isLoading ? <Loader2Icon className="size-3.5 animate-spin" /> : <HashIcon className="size-3.5" />}
      className="w-72"
      align="center"
    >
      <div className="space-y-2 p-1">
        <p className="text-xs text-muted-foreground">
          Load a played match to fill the draft with its heroes, lanes and players.
        </p>
        <div className="flex gap-1.5">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="Match ID"
            inputMode="numeric"
            className="h-8 font-mono text-xs"
          />
          <Button size="sm" className="h-8 gap-1.5" onClick={submit} disabled={isLoading}>
            <DownloadIcon className="size-3.5" />
            Load
          </Button>
        </div>
        {error && <p className="text-xs text-balance text-destructive">{error}</p>}
        {matchId !== null && (
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" className="h-7 flex-1 gap-1.5 text-xs" onClick={onFlipSides}>
              <RepeatIcon className="size-3" />
              Swap sides
            </Button>
            <Button variant="ghost" size="sm" className="h-7 flex-1 gap-1.5 text-xs" onClick={onClear}>
              <XIcon className="size-3" />
              Clear
            </Button>
          </div>
        )}
      </div>
    </FilterPill>
  );
}
