import { createFileRoute } from "@tanstack/react-router";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useCallback } from "react";

import { ConversationsView } from "~/components/features/sounds/ConversationsView";
import { ALL_FOLDERS, EffectsView } from "~/components/features/sounds/EffectsView";
import { useSoundCatalog } from "~/components/features/sounds/useSoundCatalog";
import { VoiceLinesView } from "~/components/features/sounds/VoiceLinesView";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useSoundPlayer } from "~/components/ui/hooks/use-sound-player";
import { SliderField } from "~/components/ui/slider-field";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { pageTitle, seo } from "~/lib/seo";
import { useStoredState } from "~/lib/use-stored-state";

const TABS = ["voice", "conversations", "effects"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  voice: "Voice lines",
  conversations: "Conversations",
  effects: "Sound effects",
};

const DEFAULT_CHARACTER = "atlas";
const DEFAULT_CATEGORY = "abilities";
const DEFAULT_VOLUME = 0.7;

export const Route = createFileRoute("/sounds")({
  component: SoundsPage,
  head: () =>
    seo({
      title: pageTitle("Deadlock Sounds & Voice Lines"),
      description:
        "Listen to every Deadlock voice line, hero conversation and sound effect: abilities, weapons, music, UI and more, grouped by hero and category.",
      path: "/sounds",
    }),
});

const searchParsers = {
  tab: parseAsStringLiteral(TABS).withDefault("voice"),
  character: parseAsString,
  category: parseAsString.withDefault(DEFAULT_CATEGORY),
  folder: parseAsString.withDefault(ALL_FOLDERS),
  heroes: parseAsArrayOf(parseAsInteger).withDefault([]),
};

function SoundsPage() {
  const [{ tab, character, category, folder, heroes }, setParams] = useQueryStates(searchParsers);
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault("").withOptions({ history: "replace" }));
  const [volume, saveVolume] = useStoredState<number>("sounds:volume", () => DEFAULT_VOLUME, {
    accept: (saved) => typeof saved === "number" && saved >= 0 && saved <= 1,
  });
  const player = useSoundPlayer({ volume });
  const { catalog, isPending, isError, refetch } = useSoundCatalog();

  const selectTab = useCallback(
    (next: string) => {
      player.stop();
      void setQuery(null);
      void setParams({ tab: next as Tab, character: null, folder: null, heroes: null });
    },
    [player, setParams, setQuery],
  );
  const hrefFor = (params: Record<string, string>) => `/sounds?${new URLSearchParams({ tab, ...params })}`;
  const voiceCharacter = character ?? DEFAULT_CHARACTER;

  return (
    <PageShell density="data" width="full">
      <PageHeader
        title="Deadlock Sounds"
        actions={
          <SliderField
            label="Volume"
            className="w-40"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onValueChange={saveVolume}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        }
      />
      <Tabs value={tab} onValueChange={selectTab} className="gap-4">
        <ResponsiveTabsList variant="nav" value={tab} onValueChange={selectTab} aria-label="Kind of sound">
          {TABS.map((id) => (
            <ResponsiveTab key={id} value={id} href={`/sounds?tab=${id}`}>
              {TAB_LABELS[id]}
            </ResponsiveTab>
          ))}
        </ResponsiveTabsList>
        {isError ? (
          <ErrorState
            title="The sounds did not load"
            description="Try loading them again."
            onRetry={() => void refetch()}
          />
        ) : isPending || !catalog ? (
          <LoadingState text="Loading every sound in the game" />
        ) : (
          <>
            <TabsContent value="voice">
              <VoiceLinesView
                catalog={catalog}
                character={catalog.vo[voiceCharacter] ? voiceCharacter : DEFAULT_CHARACTER}
                onCharacterChange={(id) => void setParams({ character: id })}
                hrefFor={(id) => hrefFor({ character: id })}
                query={query}
                onQueryChange={(value) => void setQuery(value || null)}
                player={player}
              />
            </TabsContent>
            <TabsContent value="conversations">
              <ConversationsView
                catalog={catalog}
                heroIds={heroes}
                onHeroIdsChange={(ids) => void setParams({ heroes: ids.length > 0 ? ids : null })}
                player={player}
              />
            </TabsContent>
            <TabsContent value="effects">
              <EffectsView
                catalog={catalog}
                category={catalog.index[category] ? category : DEFAULT_CATEGORY}
                onCategoryChange={(id) => void setParams({ category: id, folder: null })}
                hrefFor={(id) => hrefFor({ category: id })}
                folder={folder}
                onFolderChange={(value) => void setParams({ folder: value === ALL_FOLDERS ? null : value })}
                query={query}
                onQueryChange={(value) => void setQuery(value || null)}
                player={player}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </PageShell>
  );
}
