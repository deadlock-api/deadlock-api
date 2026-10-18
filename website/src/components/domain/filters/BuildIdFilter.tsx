import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { heroBuildLookupQueryOptions } from "~/queries/hero-build-stats-query";

export interface BuildIdChoice {
  buildId: number;
  /** The hero the build is for, which the page switches to. */
  heroId: number;
}

/**
 * A published build looked up by its ID, as players share it: its popover takes an ID, finds the build and the hero it
 * is for, and says so when no build has it. The cell shows the selected build's ID but is never marked active: a build
 * picked from a list is a selection, not a filter.
 */
export function BuildIdFilter({
  value,
  onValueChange,
  label = "Build ID",
  ...props
}: FilterCellPassthroughProps & {
  /** The selected build's ID; null for none. */
  value: number | null;
  /** The found build and its hero. */
  onValueChange: (choice: BuildIdChoice) => void;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const find = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = Number(draft.trim());
    if (!Number.isSafeInteger(id) || id <= 0) {
      setError("A build ID is a whole number");
      return;
    }
    setPending(true);
    queryClient
      .query(heroBuildLookupQueryOptions(id))
      .then((build) => {
        setPending(false);
        if (!build) {
          setError(`No published build has the ID ${id}`);
          return;
        }
        setError(null);
        setDraft("");
        setOpen(false);
        onValueChange({ buildId: build.buildId, heroId: build.heroId });
      })
      .catch(() => {
        setPending(false);
        setError("The build could not be looked up, try again");
      });
  };

  return (
    <FilterCell
      label={label}
      value={value === null ? "Search" : String(value)}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
      contentClassName="w-64 p-3"
      {...props}
    >
      <form onSubmit={find} className="flex flex-col gap-2">
        <Field label={label} htmlFor={inputId} error={error}>
          <Input
            id={inputId}
            size="sm"
            inputMode="numeric"
            autoComplete="off"
            placeholder={value === null ? "e.g. 242723" : String(value)}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" size="sm" loading={pending} loadingLabel="Finding the build">
          Show build
        </Button>
      </form>
    </FilterCell>
  );
}
