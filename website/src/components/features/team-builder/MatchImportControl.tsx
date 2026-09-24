import { DownloadIcon, HashIcon, RepeatIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
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
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  // A pasted match link works as well as the bare ID: the last run of digits is the match.
  const submit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(draft.match(/\d+/g)?.at(-1));
    const valid = Number.isSafeInteger(parsed) && parsed > 0;
    setInvalid(!valid);
    if (valid) onLoad(parsed);
  };

  return (
    <FilterCell
      label="Match"
      value={matchId === null ? "None" : String(matchId)}
      active={matchId !== null}
      onReset={onClear}
      icon={isLoading ? <Spinner size="sm" /> : <HashIcon className="size-3.5" />}
      contentClassName="w-72"
      align="center"
    >
      <Stack gap={2} className="p-1">
        <form onSubmit={submit} noValidate>
          <Field
            label="Match ID"
            htmlFor={inputId}
            labelDisplay="hidden"
            description="Load a played match to fill the draft with its heroes, lanes and players."
            error={invalid ? "Enter a match ID or paste a match link." : error}
          >
            <Inline gap={1.5} wrap="nowrap">
              <Input
                id={inputId}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setInvalid(false);
                }}
                placeholder="Match ID"
                inputMode="numeric"
                autoComplete="off"
                size="sm"
                className="font-mono text-xs"
              />
              <Button type="submit" size="sm" disabled={isLoading}>
                <DownloadIcon className="size-3.5" />
                Load
              </Button>
            </Inline>
          </Field>
        </form>
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
