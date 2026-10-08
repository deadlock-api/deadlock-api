import { useMemo, useState } from "react";

import {
  NoSounds,
  SoundBrowser,
  SoundGroupItem,
  SoundListMore,
  type SoundPlayer,
  VoiceAvatar,
} from "~/components/features/sounds/SoundBrowserParts";
import { nameOf, type SoundCatalog } from "~/components/features/sounds/useSoundCatalog";
import { Panel, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { SoundList } from "~/components/patterns/sound/SoundList";
import { useInfiniteItems } from "~/components/ui/hooks/use-infinite-items";
import { SearchInput } from "~/components/ui/search-input";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { groupTopics, humanizeSoundName, isSoundTree, matchesSoundQuery, voiceSections } from "~/lib/sounds";

const SECTION_LABELS: Record<string, string> = { lines: "Lines", ping: "Pings", emote: "Emotes" };

function sectionLabel(id: string): string {
  return SECTION_LABELS[id] ?? humanizeSoundName(id);
}

interface VoiceLinesViewProps {
  catalog: SoundCatalog;
  character: string;
  onCharacterChange: (id: string) => void;
  hrefFor: (id: string) => string;
  query: string;
  onQueryChange: (query: string) => void;
  player: SoundPlayer;
}

export function VoiceLinesView({ catalog, character, onCharacterChange, hrefFor, ...props }: VoiceLinesViewProps) {
  const entries = useMemo(
    () =>
      catalog.characters.map((c) => ({
        id: c.id,
        label: c.name,
        count: c.count,
        media: <VoiceAvatar hero={c.hero} size="xs" />,
      })),
    [catalog.characters],
  );
  return (
    <SoundBrowser
      title="Characters"
      entries={entries}
      value={character}
      onValueChange={onCharacterChange}
      hrefFor={hrefFor}
    >
      <CharacterLines key={character} catalog={catalog} character={character} {...props} />
    </SoundBrowser>
  );
}

function CharacterLines({
  catalog,
  character,
  query,
  onQueryChange,
  player,
}: Pick<VoiceLinesViewProps, "catalog" | "character" | "query" | "onQueryChange" | "player">) {
  const tree = catalog.vo[character];
  const info = catalog.characters.find((c) => c.id === character);
  const name = info?.name ?? humanizeSoundName(character);
  const sections = useMemo(() => {
    if (!isSoundTree(tree)) return [];
    const speakerWords = new Set([
      character,
      ...name
        .toLowerCase()
        .split(/[\s&]+/)
        .filter(Boolean),
    ]);
    return voiceSections(tree, catalog.names, speakerWords);
  }, [tree, catalog.names, character, name]);
  const [section, setSection] = useState("all");
  const topics = useMemo(
    () =>
      sections.flatMap((s) =>
        groupTopics(s.groups, { findHero: catalog.findHero, heroName: (codename) => nameOf(catalog, codename) }),
      ),
    [sections, catalog],
  );
  // A topic whose own name matches keeps all its lines; otherwise only the lines that match stay.
  const shown = useMemo(
    () =>
      topics
        .filter((topic) => section === "all" || (topic.folder || "lines") === section)
        .map((topic) =>
          matchesSoundQuery(query, topic.label, [])
            ? topic
            : {
                id: topic.id,
                label: topic.label,
                folder: topic.folder,
                rows: topic.rows.filter((row) =>
                  matchesSoundQuery(query, `${topic.label} ${row.label}`, row.group.takes, row.group.label),
                ),
              },
        )
        .filter((topic) => topic.rows.length > 0),
    [topics, section, query],
  );
  const lineCount = shown.reduce((sum, topic) => sum + topic.rows.length, 0);
  const paged = useInfiniteItems(shown, { step: 12 });

  return (
    <Panel>
      <PanelHeader title={`${name} · ${lineCount.toLocaleString("en-US")} voice lines`}>
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center justify-end gap-2 @lg:basis-auto">
          {sections.length > 1 && (
            <Segmented size="sm" width="hug" aria-label="Kind of line" value={section} onValueChange={setSection}>
              <SegmentedItem value="all">All</SegmentedItem>
              {sections.map((s) => (
                <SegmentedItem key={s.id} value={s.id}>
                  {sectionLabel(s.id)}
                </SegmentedItem>
              ))}
            </Segmented>
          )}
          <SearchInput
            size="sm"
            className="w-full @lg:w-56"
            aria-label={`Search ${name}'s voice lines`}
            placeholder="Search lines"
            value={query}
            onValueChange={onQueryChange}
          />
        </div>
      </PanelHeader>
      {shown.length === 0 ? (
        <NoSounds query={query} />
      ) : (
        paged.items.map((topic) => {
          const title =
            section === "all" && topic.folder ? `${sectionLabel(topic.folder)} · ${topic.label}` : topic.label;
          return (
            <section key={topic.id} aria-label={title}>
              <PanelSection title={title}>{topic.rows.length.toLocaleString("en-US")}</PanelSection>
              <SoundList aria-label={title}>
                {topic.rows.map((row) => (
                  <SoundGroupItem
                    key={row.group.id}
                    group={row.group}
                    label={row.label}
                    player={player}
                    media={row.subject ? <VoiceAvatar hero={catalog.heroes.get(row.subject)} size="xs" /> : undefined}
                  />
                ))}
              </SoundList>
            </section>
          );
        })
      )}
      <SoundListMore list={paged} noun="topic" />
    </Panel>
  );
}
