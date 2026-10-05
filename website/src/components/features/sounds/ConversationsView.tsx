import { useMemo } from "react";

import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { SoundListMore, type SoundPlayer, VoiceAvatar } from "~/components/features/sounds/SoundBrowserParts";
import { nameOf, type SoundCatalog } from "~/components/features/sounds/useSoundCatalog";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { SoundList, SoundListItem } from "~/components/patterns/sound/SoundList";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { useInfiniteItems } from "~/components/ui/hooks/use-infinite-items";
import { SoundButton } from "~/components/ui/sound-button";
import { buildConversations, type Conversation } from "~/lib/sounds";

interface ConversationsViewProps {
  catalog: SoundCatalog;
  /** Conversations with every one of these heroes in them; none shows them all. */
  heroIds: number[];
  onHeroIdsChange: (ids: number[]) => void;
  player: SoundPlayer;
}

export function ConversationsView({ catalog, heroIds, onHeroIdsChange, player }: ConversationsViewProps) {
  const conversations = useMemo(() => buildConversations(catalog.vo, catalog.names), [catalog.vo, catalog.names]);
  const shown = useMemo(() => {
    const codenames = new Set(
      [...catalog.heroes].filter(([, hero]) => heroIds.includes(hero.id)).map(([codename]) => codename),
    );
    if (codenames.size === 0) return conversations;
    return conversations.filter((convo) => [...codenames].every((codename) => convo.speakers.includes(codename)));
  }, [conversations, heroIds, catalog.heroes]);

  return (
    <Panel>
      <PanelHeader title={`${shown.length.toLocaleString("en-US")} conversations`}>
        <HeroSelector
          selection="multiple"
          size="sm"
          emptyLabel="Any hero"
          value={heroIds}
          onValueChange={onHeroIdsChange}
        />
      </PanelHeader>
      <ConversationPages key={heroIds.join(",")} conversations={shown} catalog={catalog} player={player} />
    </Panel>
  );
}

function ConversationPages({
  conversations,
  catalog,
  player,
}: {
  conversations: Conversation[];
  catalog: SoundCatalog;
  player: SoundPlayer;
}) {
  const paged = useInfiniteItems(conversations);
  if (conversations.length === 0) return <EmptyState variant="inline" title="These heroes share no conversation" />;
  return (
    <>
      <SoundList aria-label="Conversations">
        {paged.items.map((convo) => (
          <ConversationItem key={convo.id} conversation={convo} catalog={catalog} player={player} />
        ))}
      </SoundList>
      <SoundListMore list={paged} noun="conversation" />
    </>
  );
}

const TAKE_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * One conversation in a row: who speaks, a button per line (the speaker's head and the line's number, a letter for a
 * second take), and Play all at the end, which plays the first take of every line in order.
 */
function ConversationItem({
  conversation,
  catalog,
  player,
}: {
  conversation: Conversation;
  catalog: SoundCatalog;
  player: SoundPlayer;
}) {
  const id = `convo:${conversation.id}`;
  const title = `${conversation.label} #${conversation.part}`;
  const sequenceState = player.stateOf(id);
  const playingLine = player.playback?.id === id ? player.playback.index : -1;
  const urls = conversation.lines.map((line) => line.takes[0].url);
  return (
    <SoundListItem
      label={title}
      meta={conversation.context || undefined}
      media={
        <span className="flex gap-0.5">
          {conversation.speakers.map((speaker) => (
            <VoiceAvatar key={speaker} hero={catalog.heroes.get(speaker)} />
          ))}
        </span>
      }
      active={sequenceState !== "idle" && sequenceState !== "error"}
    >
      {conversation.lines.map((line, index) => {
        const speaker = nameOf(catalog, line.speaker);
        return line.takes.map((take, i) => {
          const name = `${index + 1}${line.takes.length > 1 ? TAKE_LETTERS[i] : ""}`;
          const inSequence = i === 0 && playingLine === index;
          return (
            <SoundButton
              key={take.url}
              state={inSequence ? sequenceState : player.stateOf(take.url)}
              duration={inSequence || player.playback?.id === take.url ? player.playback?.duration : undefined}
              label={`${speaker}, line ${name}`}
              title={`${speaker}: ${take.name}`}
              onClick={() => player.toggle(take.url, take.url)}
            >
              <VoiceAvatar hero={catalog.heroes.get(line.speaker)} size="2xs" />
              {name}
            </SoundButton>
          );
        });
      })}
      <SoundButton state={sequenceState} label={`conversation ${title}`} onClick={() => player.toggle(id, urls)}>
        {sequenceState === "playing" ? "Stop" : "Play all"}
      </SoundButton>
    </SoundListItem>
  );
}
