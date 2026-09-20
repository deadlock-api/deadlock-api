import { DownloadIcon, HashIcon, RepeatIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Inline, Stack } from "~/components/ui/stack";

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
    <FilterCell
      label="Match"
      value={matchId === null ? "none" : String(matchId)}
      active={matchId !== null}
      icon={isLoading ? <Spinner size="sm" /> : <HashIcon className="size-3.5" />}
      contentClassName="w-72"
      align="center"
    >
      <Stack gap={2} className="p-1">
        <p className="text-xs text-muted-foreground">
          Load a played match to fill the draft with its heroes, lanes and players.
        </p>
        <Inline gap={1.5} wrap="nowrap">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="Match ID"
            inputMode="numeric"
            size="sm"
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={submit} disabled={isLoading}>
            <DownloadIcon className="size-3.5" />
            Load
          </Button>
        </Inline>
        {error && <p className="text-xs text-balance text-destructive">{error}</p>}
        {matchId !== null && (
          <Inline gap={1.5} wrap="nowrap">
            <Button variant="secondary" size="xs" className="flex-1" onClick={onFlipSides}>
              <RepeatIcon />
              Swap sides
            </Button>
            <Button variant="ghost" size="xs" className="flex-1" onClick={onClear}>
              <XIcon />
              Clear
            </Button>
          </Inline>
        )}
      </Stack>
    </FilterCell>
  );
}
