import { FolderOpen, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { type SavedBuild, useSavedBuilds } from "~/hooks/useSavedBuilds";

// The item art a saved build shows in the list, its first picks.
const PREVIEW_ITEMS = 6;

/** "Save": names the current build and keeps it in this browser. */
export function SaveBuildButton({
  defaultName,
  heroId,
  path,
  sells,
  flex,
  skills,
}: {
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
        <Button variant="ghost" size="xs">
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

/** "Saved": the builds kept in this browser, to open one again or delete it. */
export function SavedBuildsMenu({ onOpen }: { onOpen: (build: SavedBuild) => void }) {
  const { builds, remove } = useSavedBuilds();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          <FolderOpen />
          Saved
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Saved builds"
        className="flex max-h-96 w-80 max-w-(--radix-popover-content-available-width) flex-col gap-1 overflow-y-auto p-1"
      >
        {builds.length === 0 ? (
          <EmptyState variant="inline" title="No saved builds" />
        ) : (
          builds.map((build) => (
            <div key={build.id} className="flex items-center gap-1">
              <OptionRow
                className="flex-1"
                aria-label={`Open ${build.name}`}
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
                onClick={() => remove(build.id)}
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
