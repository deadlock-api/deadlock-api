import { useEffect, useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { LiveList, LiveListItem } from "~/components/patterns/live-list/LiveList";
import { Text } from "~/components/ui/text";

const EVENTS = ["Ranked · EU West", "Unranked · US East", "Street Brawl · Asia", "Ranked · Hong Kong"] as const;

/** A feed that gains an entry a second, the oldest leaving at the bottom. */
function useTicker(max: number) {
  const [entries, setEntries] = useState<{ id: number; text: string }[]>(() =>
    [3, 2, 1, 0].map((id) => ({ id, text: EVENTS[id % EVENTS.length] })),
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      setEntries((prev) => {
        const id = (prev[0]?.id ?? 0) + 1;
        return [{ id, text: EVENTS[id % EVENTS.length] }, ...prev].slice(0, max);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [max]);
  return entries;
}

/** A list new entries stream into at the top of: the live page's matches being written. */
export function PatternsLiveList() {
  const entries = useTicker(8);
  return (
    <Specimen
      name="LiveList"
      source="patterns/live-list/LiveList"
      note="A live feed: LiveListItems enter at the top as they arrive and the oldest fall off the bottom. Each new item opens its own height (the items below glide down) and glows with the primary tint for --duration-highlight; with reduced motion they simply appear. edge fade (default) fades the cut-off end, cut ends hard. It is a log that does not announce (aria-live off), so pair it with a count that says what is arriving. density compact halves the padding. Keep the newest first and cap the list."
    >
      <Variants label="an entry a second, edge fade" className="block">
        <LiveList label="Demo feed" className="h-56">
          {entries.map((entry) => (
            <LiveListItem key={entry.id}>
              <Text variant="caption">
                Match {1000 + entry.id} · {entry.text}
              </Text>
            </LiveListItem>
          ))}
        </LiveList>
      </Variants>
      <Variants label="density compact, edge cut" className="block">
        <LiveList label="Compact demo feed" edge="cut" className="h-32">
          {entries.map((entry) => (
            <LiveListItem key={entry.id} density="compact">
              <Text variant="meta">
                Match {1000 + entry.id} · {entry.text}
              </Text>
            </LiveListItem>
          ))}
        </LiveList>
      </Variants>
    </Specimen>
  );
}
