import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import {
  ListDetail,
  ListDetailAside,
  ListDetailItem,
  ListDetailMain,
} from "~/components/patterns/list-detail/ListDetail";
import { Text } from "~/components/ui/text";

const ENTRIES = [
  { id: "c", title: "City Never Sleeps", aside: "Sep 29", meta: "Sep 29, 2026 · 6 days" },
  { id: "b", title: "Update", aside: "Sep 16", meta: "Sep 16, 2026 · 13 days" },
  { id: "a", title: "Matchmaking", aside: "Jul 30", meta: "Jul 30, 2026 · 13 days" },
] as const;

/** A list beside the entry it shows: the patch list, the tracker's match history. */
export function PatternsListDetail() {
  const [current, setCurrent] = useState<string>(ENTRIES[0].id);
  const picked = ENTRIES.find((entry) => entry.id === current) ?? ENTRIES[0];
  return (
    <Specimen
      name="ListDetail"
      source="patterns/list-detail/ListDetail"
      note="A list of entries beside the one shown. ListDetailMain holds the details; ListDetailAside (label names its nav, header sits above the rows) holds ListDetailItems (title, aside on the title's line, meta under it, current marks the shown one). From @3xl the list moves to the start side, as tall as the details, and scrolls inside that height; below it follows them in a short scrolling box. Up, Down, Home and End move between the rows; selection follow (used here) opens the row the keys stop on, so the details can be walked through. height viewport keeps the list at --list-pane-height instead of the details' height and sticks it. With asChild a router link is the row."
    >
      <Variants label="three entries, the first current" className="block">
        <ListDetail>
          <ListDetailMain>
            <Text variant="label">{picked.title}</Text>
            <Text variant="caption" tone="muted">
              {picked.meta}
            </Text>
          </ListDetailMain>
          <ListDetailAside label="Example entries" selection="follow">
            {ENTRIES.map((entry) => (
              <ListDetailItem
                key={entry.id}
                title={entry.title}
                aside={entry.aside}
                meta={entry.meta}
                current={entry.id === current}
                onClick={() => setCurrent(entry.id)}
              />
            ))}
          </ListDetailAside>
        </ListDetail>
      </Variants>
    </Specimen>
  );
}
