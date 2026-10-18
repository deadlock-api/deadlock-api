import { FolderOpen, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { useFocusAfterChange } from "~/components/ui/hooks/use-focus-after-change";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { type SavedBuild, useSavedBuilds } from "~/hooks/useSavedBuilds";

// The item art a saved build shows in the list, its first picks.
const PREVIEW_ITEMS = 6;

/** "Save": names the current build and keeps it in this browser. */
export function SaveBuildButton({
  disabled = false,
  defaultName,
  heroId,
  path,
  sells,
  flex,
  skills,
}: {
  /** Nothing to save yet: the button keeps its place on the row. */
  disabled?: boolean;
  defaultName: string;
  heroId: number | null;
  path: string[];
  sells: string[];
  flex: number[];
  /** The reader's own skill order, if any. */
  skills?: number[];
}) {
  const { save } = useSavedBuilds();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setName(defaultName);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" disabled={disabled}>
          <Save />
          Save
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Save build" className="w-72">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            save({ name: trimmed, heroId, path, sells, flex, skills });
            setOpen(false);
          }}
        >
          <Input
            size="sm"
            aria-label="Build name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** "My builds": the builds kept in this browser, to open one again or delete it. */
export function SavedBuildsMenu({ onOpen }: { onOpen: (build: SavedBuild) => void }) {
  const { builds, remove } = useSavedBuilds();
  const [open, setOpen] = useState(false);
  // A deleted build takes its row, and the focused Delete button, with it: focus moves to the next build's row.
  const { ref: focusRef, focusAfterChange } = useFocusAfterChange(builds.map((build) => build.id).join());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          <FolderOpen />
          My builds
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={focusRef}
        align="end"
        aria-label="Saved builds"
        className="flex max-h-96 w-80 max-w-(--radix-popover-content-available-width) flex-col gap-1 overflow-y-auto p-1"
      >
        {builds.length === 0 ? (
          <EmptyState variant="inline" title="No saved builds" />
        ) : (
          builds.map((build, index) => (
            <div key={build.id} className="flex items-center gap-1">
              <OptionRow
                className="flex-1"
                aria-label={`Open ${build.name}`}
                data-build-id={build.id}
                trailing={<span className="text-xs text-muted-foreground tabular-nums">{build.path.length} items</span>}
                leading={
                  build.heroId != null ? (
                    <HeroImage heroId={build.heroId} shape="circle" title="" className="size-6 shrink-0" />
                  ) : undefined
                }
                description={
                  <span className="flex gap-0.5">
                    {build.path.slice(0, PREVIEW_ITEMS).map((key) => (
                      <ItemImage key={key} itemId={Number(key.split(":")[1])} className="size-4" />
                    ))}
                  </span>
                }
                onClick={() => {
                  onOpen(build);
                  setOpen(false);
                }}
              >
                {build.name}
              </OptionRow>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${build.name}`}
                onClick={() => {
                  // The last build gone, the menu closes and focus goes back to its button.
                  if (builds.length === 1) setOpen(false);
                  else
                    focusAfterChange(
                      [builds[index + 1], builds[index - 1]].flatMap((b) => (b ? [`[data-build-id="${b.id}"]`] : [])),
                    );
                  remove(build.id);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
