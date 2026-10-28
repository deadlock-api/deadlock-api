import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { HeroBuild } from "~/lib/wasm/hero-build";
import { heroBuildCodecQueryOptions } from "~/lib/wasm/load-hero-build";
import { WasmCallError } from "~/lib/wasm/module";
import { heroBuildLookupQueryOptions } from "~/queries/hero-build-stats-query";

export interface BuildIdChoice {
  buildId: number;
  /** The hero the build is for, which the page switches to. */
  heroId: number;
}

/**
 * A published build looked up by its ID, as players share it, or by a build code copied in game: its popover takes
 * either, finds the build and the hero it is for, and says so when no build has it. A code of a build that is not
 * published (a player's own, or an edited copy, which keeps the ID it was copied from) goes to `onUnpublishedBuild`. The cell shows the selected build's ID but is never marked active: a build
 * picked from a list is a selection, not a filter.
 */
export function BuildIdFilter({
  value,
  onValueChange,
  onUnpublishedBuild,
  label = "Build ID",
  ...props
}: FilterCellPassthroughProps & {
  /** The selected build's ID; null for none. */
  value: number | null;
  /** The found build and its hero. */
  onValueChange: (choice: BuildIdChoice) => void;
  /** A pasted game build that is not published; without it, such a code is answered as not found. */
  onUnpublishedBuild?: (build: HeroBuild) => void;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const lookUp = async (text: string): Promise<string | null> => {
    if (/^\d+$/.test(text)) {
      const id = Number(text);
      if (!Number.isSafeInteger(id) || id <= 0) return "A build ID is a whole number";
      const build = await queryClient.query(heroBuildLookupQueryOptions(id));
      if (!build) return `No published build has the ID ${id}`;
      onValueChange({ buildId: build.buildId, heroId: build.heroId });
      return null;
    }
    let pasted: HeroBuild;
    try {
      pasted = (await queryClient.query(heroBuildCodecQueryOptions)).decode(text);
    } catch (caught) {
      if (caught instanceof WasmCallError) return "Enter a build ID or paste a build code from the game";
      throw caught;
    }
    const id = pasted.hero_build_id ?? 0;
    const published = id > 0 ? await queryClient.query(heroBuildLookupQueryOptions(id)) : null;
    // An edited copy keeps the ID of the build it was copied from, often another hero's.
    if (published && published.heroId === pasted.hero_id) {
      onValueChange({ buildId: published.buildId, heroId: published.heroId });
      return null;
    }
    if (!onUnpublishedBuild) return "This build is not published";
    onUnpublishedBuild(pasted);
    return null;
  };

  const find = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      setError("Enter a build ID or paste a build code from the game");
      return;
    }
    setPending(true);
    lookUp(text)
      .then((problem) => {
        setPending(false);
        setError(problem);
        if (problem) return;
        setDraft("");
        setOpen(false);
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
        <Field label={`${label} or game code`} htmlFor={inputId} error={error}>
          <Input
            id={inputId}
            size="sm"
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
