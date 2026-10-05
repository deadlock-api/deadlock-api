import type { Hero } from "deadlock_api_client";
import { AudioLines } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { LoadMore } from "~/components/patterns/data-table/LoadMore";
import { SideNav, SideNavItem } from "~/components/patterns/navigation/SideNav";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { SoundListItem } from "~/components/patterns/sound/SoundList";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import type { useInfiniteItems } from "~/components/ui/hooks/use-infinite-items";
import type { useSoundPlayer } from "~/components/ui/hooks/use-sound-player";
import { IconTile } from "~/components/ui/icon-tile";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { SoundButton } from "~/components/ui/sound-button";
import type { SoundGroup } from "~/lib/sounds";
import { cn } from "~/lib/utils";

export type SoundPlayer = ReturnType<typeof useSoundPlayer>;

export interface BrowseEntry {
  id: string;
  label: string;
  count: number;
  media?: React.ReactNode;
}

/** The picture of a voice: the hero's minimap head, or a plain tile for announcers and NPCs. */
const AVATAR_SIZE = { "2xs": "size-4", xs: "size-6", sm: "size-8" } as const;

export function VoiceAvatar({ hero, size = "sm" }: { hero: Hero | undefined; size?: keyof typeof AVATAR_SIZE }) {
  if (hero) return <HeroImage hero={hero} title="" className={AVATAR_SIZE[size]} />;
  if (size === "2xs") return null;
  return (
    <IconTile size={size} shape="circle">
      <AudioLines aria-hidden="true" />
    </IconTile>
  );
}

/**
 * What a view browses (characters, categories) beside its list: a scrolling list of links from md up, a select in
 * the list's header below. Each entry is a link with the URL it opens, so a modified click opens it in a new tab.
 */
export function SoundBrowser({
  title,
  entries,
  value,
  onValueChange,
  hrefFor,
  children,
}: {
  title: string;
  entries: BrowseEntry[];
  value: string;
  onValueChange: (id: string) => void;
  hrefFor: (id: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <Panel className="sticky top-0 hidden max-h-svh md:flex">
        <PanelHeader title={title} size="sm" />
        <SideNav aria-label={title} className={cn(SCROLLBAR_THIN, "min-h-0 overflow-y-auto p-1.5")}>
          <div className="flex flex-col gap-0.5">
            {entries.map((entry) => (
              <SideNavItem
                key={entry.id}
                href={hrefFor(entry.id)}
                active={entry.id === value}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onValueChange(entry.id);
                }}
              >
                {entry.media}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {entry.count.toLocaleString("en-US")}
                </span>
              </SideNavItem>
            ))}
          </div>
        </SideNav>
      </Panel>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="md:hidden">
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger aria-label={title} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entries.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {children}
      </div>
    </div>
  );
}

/** One line or effect with a button per take; the row lights while any of its takes plays. */
export function SoundGroupItem({
  group,
  player,
  label = group.label,
  meta,
  media,
}: {
  group: SoundGroup;
  player: SoundPlayer;
  /** The row's name where a heading already says the rest (a topic's hero); the buttons keep the full name. */
  label?: string;
  meta?: React.ReactNode;
  media?: React.ReactNode;
}) {
  const playingUrl = player.playback?.id;
  const active = group.takes.some((take) => take.url === playingUrl);
  const several = group.takes.length > 1;
  return (
    <SoundListItem label={label} meta={meta} media={media} active={active}>
      {group.takes.map((take, i) => (
        <SoundButton
          key={take.url}
          state={player.stateOf(take.url)}
          duration={player.playback?.id === take.url ? player.playback.duration : undefined}
          label={several ? `${group.label}, take ${i + 1}` : group.label}
          title={take.name}
          onClick={() => player.toggle(take.url, take.url)}
        >
          {several ? i + 1 : undefined}
        </SoundButton>
      ))}
    </SoundListItem>
  );
}

/** After a list grown by `useInfiniteItems`: loads the next rows as the end of the list nears the viewport. */
export function SoundListMore({ list, noun }: { list: ReturnType<typeof useInfiniteItems>; noun: string }) {
  return <LoadMore loaded={list.items.length} total={list.total} onLoadMore={list.showMore} noun={noun} />;
}

export function NoSounds({ query }: { query: string }) {
  return <EmptyState variant="inline" title={query ? `Nothing matches “${query}”` : "No sounds here"} />;
}
