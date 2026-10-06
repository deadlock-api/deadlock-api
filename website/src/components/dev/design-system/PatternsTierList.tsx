import { Apple, Cherry, Citrus, Grape } from "lucide-react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { TierGroup, TierItem, TierList, TierListHead, TierRow } from "~/components/patterns/tier-list/TierList";

const FRUIT = {
  apple: { name: "Apple", icon: Apple },
  cherry: { name: "Cherry", icon: Cherry },
  citrus: { name: "Citrus", icon: Citrus },
  grape: { name: "Grape", icon: Grape },
} as const;

function Fruit({ id, meta, href }: { id: keyof typeof FRUIT; meta: string; href?: string }) {
  const { name, icon: Icon } = FRUIT[id];
  return (
    <TierItem
      value={id}
      name={name}
      meta={meta}
      media={<Icon aria-hidden="true" className="size-6" />}
      asChild={href != null}
    >
      {href != null && <a href={href}>{name}</a>}
    </TierItem>
  );
}

/** The tier list: rows of items, or rows split into groups that sit side by side on a wide container. */
export function PatternsTierList() {
  return (
    <>
      <Specimen
        name="TierList"
        source="patterns/tier-list/TierList"
        note="Things ranked S to D, best first: an ordered list of TierRows on one card. The letter names the tier and its tint only repeats it. A TierItem is a tile (media, name, one reading); with asChild the whole tile is the link. A row with no items says so."
      >
        <Variants label="tiers, linked items, an empty tier" className="block">
          <TierList aria-label="Fruit tiers">
            <TierRow tier="s">
              <Fruit id="grape" meta="58.1%" href="#grape" />
              <Fruit id="cherry" meta="55.0%" href="#cherry" />
            </TierRow>
            <TierRow tier="a">
              <Fruit id="apple" meta="52.4%" href="#apple" />
            </TierRow>
            <TierRow tier="b" />
            <TierRow tier="c">
              <Fruit id="citrus" meta="47.9%" />
            </TierRow>
            <TierRow tier="d" label="F" />
          </TierList>
        </Variants>
      </Specimen>

      <Specimen
        name="TierList grouped"
        source="patterns/tier-list/TierList"
        note="columns splits every row into TierGroups. On a wide container they sit side by side under a TierListHead (hidden from screen readers, which hear each group's own label); narrower, each group stacks with its label. An item may sit in more than one group: items sharing a value highlight together while one is hovered or focused (value / defaultValue / onValueChange on TierList). Hover Apple."
      >
        <Variants label="columns={2}" className="block">
          <TierList aria-label="Fruit tiers by color">
            <TierListHead columns={2}>
              <span>Red</span>
              <span>Other</span>
            </TierListHead>
            <TierRow tier="s" columns={2}>
              <TierGroup label="Red">
                <Fruit id="cherry" meta="55.0%" />
                <Fruit id="apple" meta="52.4%" />
              </TierGroup>
              <TierGroup label="Other">
                <Fruit id="grape" meta="58.1%" />
                <Fruit id="apple" meta="52.4%" />
              </TierGroup>
            </TierRow>
            <TierRow tier="a" columns={2}>
              <TierGroup label="Red" />
              <TierGroup label="Other">
                <Fruit id="citrus" meta="47.9%" />
              </TierGroup>
            </TierRow>
          </TierList>
        </Variants>
      </Specimen>
    </>
  );
}
