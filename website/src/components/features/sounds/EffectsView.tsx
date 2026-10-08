import { useMemo } from "react";

import {
  NoSounds,
  SoundBrowser,
  SoundGroupItem,
  SoundListMore,
  type SoundPlayer,
} from "~/components/features/sounds/SoundBrowserParts";
import { nameOf, type SoundCatalog } from "~/components/features/sounds/useSoundCatalog";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { SoundList } from "~/components/patterns/sound/SoundList";
import { useInfiniteItems } from "~/components/ui/hooks/use-infinite-items";
import { SearchInput } from "~/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import {
  countSounds,
  effectCategories,
  flattenSounds,
  groupTakes,
  humanizeSoundName,
  isSoundTree,
  matchesSoundQuery,
  type SoundTree,
} from "~/lib/sounds";

/** The value of the folder select that shows the whole category. */
export const ALL_FOLDERS = "all";

const CATEGORY_LABELS: Record<string, string> = {
  ambient: "Ambient (emitters)",
  hit_indicators: "Hit indicators",
  npc: "NPCs",
  physics_new: "Physics (new)",
  ui: "UI",
};

function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? humanizeSoundName(id);
}

interface EffectsViewProps {
  catalog: SoundCatalog;
  category: string;
  onCategoryChange: (id: string) => void;
  hrefFor: (id: string) => string;
  folder: string;
  onFolderChange: (folder: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  player: SoundPlayer;
}

export function EffectsView({
  catalog,
  category,
  onCategoryChange,
  hrefFor,
  folder,
  onFolderChange,
  query,
  onQueryChange,
  player,
}: EffectsViewProps) {
  const entries = useMemo(
    () =>
      effectCategories(catalog.index).map((id) => ({
        id,
        label: categoryLabel(id),
        count: countSounds(catalog.index[id] as SoundTree),
      })),
    [catalog.index],
  );
  const tree = catalog.index[category];
  const folderLabel = (path: string) =>
    path
      .split("/")
      .map((part) => nameOf(catalog, part))
      .join(" / ");
  const folders = useMemo(
    () => (isSoundTree(tree) ? Object.keys(tree).filter((key) => isSoundTree(tree[key])) : []),
    [tree],
  );
  const groups = useMemo(() => {
    if (!isSoundTree(tree)) return [];
    const files = flattenSounds(tree).filter(({ path }) => folder === ALL_FOLDERS || path[0] === folder);
    // A file often starts with its top folder's name (`abilities/abrams/abrams_a2_charge_…`), which the row's folder
    // line already says.
    return groupTakes(files, catalog.names, new Set(folders));
  }, [tree, folder, folders, catalog.names]);
  const shown = useMemo(
    () => groups.filter((g) => matchesSoundQuery(query, g.label, g.takes, g.folder)),
    [groups, query],
  );
  const title = categoryLabel(category);

  return (
    <SoundBrowser
      title="Categories"
      entries={entries}
      value={category}
      onValueChange={onCategoryChange}
      hrefFor={hrefFor}
    >
      <Panel>
        <PanelHeader title={`${title} · ${shown.length.toLocaleString("en-US")} sounds`}>
          <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center justify-end gap-2 @lg:basis-auto">
            {folders.length > 1 && (
              <Select value={folder} onValueChange={onFolderChange}>
                <SelectTrigger size="sm" aria-label="Folder" className="w-full @lg:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
                  {folders.map((name) => (
                    <SelectItem key={name} value={name}>
                      {nameOf(catalog, name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <SearchInput
              size="sm"
              className="w-full @lg:w-56"
              aria-label={`Search ${title} sounds`}
              placeholder="Search sounds"
              value={query}
              onValueChange={onQueryChange}
            />
          </div>
        </PanelHeader>
        <EffectPages
          key={`${category}:${folder}:${query}`}
          groups={shown}
          player={player}
          query={query}
          folderLabel={folderLabel}
          label={`${title} sounds`}
        />
      </Panel>
    </SoundBrowser>
  );
}

function EffectPages({
  groups,
  player,
  query,
  folderLabel,
  label,
}: {
  groups: ReturnType<typeof groupTakes>;
  player: SoundPlayer;
  query: string;
  folderLabel: (path: string) => string;
  label: string;
}) {
  const paged = useInfiniteItems(groups);
  if (groups.length === 0) return <NoSounds query={query} />;
  return (
    <>
      <SoundList aria-label={label}>
        {paged.items.map((group) => (
          <SoundGroupItem
            key={group.id}
            group={group}
            player={player}
            meta={group.folder ? folderLabel(group.folder) : undefined}
          />
        ))}
      </SoundList>
      <SoundListMore list={paged} noun="sound" />
    </>
  );
}
