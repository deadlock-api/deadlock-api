import { useQuery } from "@tanstack/react-query";

import { SAMPLE_ABILITY_IDS, SAMPLE_ITEM_IDS, UNKNOWN_ID } from "~/components/dev/design-system/samples";
import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemCell } from "~/components/domain/assets/ItemCell";
import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { toneOf } from "~/lib/tone";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

const HERO_IDS = [1, 2, 3, 4];
const RANKED_HEROES = [
  { heroId: 1, winRate: 0.542, usage: 0.31 },
  { heroId: 2, winRate: 0.531, usage: 0.12 },
  { heroId: 3, winRate: 0.528, usage: 0.44 },
  { heroId: 4, winRate: 0.497, usage: 0.08 },
];

export function Round3DomainAssets() {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const { data: items, isLoading: isLoadingItems } = useQuery(itemUpgradesQueryOptions);

  return (
    <>
      <Specimen
        name="HeroCell and ItemCell"
        source="domain/assets/HeroCell · domain/assets/ItemCell"
        note="The identity of a table or list row: image and name on one line, the name truncating to the width the parent leaves. Pass item instead of itemId to render an item the table already holds, so a long table keeps one subscription."
      >
        <Variants label="HeroCell size: default, sm · linkToDetail">
          <HeroCell heroId={HERO_IDS[0]} />
          <HeroCell heroId={HERO_IDS[1]} linkToDetail />
          <HeroCell heroId={HERO_IDS[2]} size="sm" className="text-xs" />
          <ItemCell itemId={SAMPLE_ITEM_IDS[0]} />
          <ItemCell itemId={SAMPLE_ITEM_IDS[1]} linkToDetail />
        </Variants>
        <Variants label="ItemCell variant: normal, corrupted (a row about the corrupted version), corrupted loading">
          <ItemCell itemId={SAMPLE_ITEM_IDS[2]} linkToDetail />
          <ItemCell itemId={SAMPLE_ITEM_IDS[2]} linkToDetail variant="corrupted" />
          <ItemCell item={undefined} loading variant="corrupted" />
        </Variants>
        <Variants label='shape="circle", truncation (max-w-24 on the cell), unknown id, loading'>
          <HeroCell heroId={HERO_IDS[3]} shape="circle" />
          <HeroCell heroId={HERO_IDS[1]} linkToDetail className="max-w-24" />
          <ItemCell itemId={SAMPLE_ITEM_IDS[0]} linkToDetail className="max-w-24" />
          <HeroCell heroId={UNKNOWN_ID} />
          <ItemCell itemId={UNKNOWN_ID} />
          <ItemCell item={undefined} loading />
        </Variants>
        <Table density="compact" aria-label="Cells in a table">
          <TableHeader>
            <TableRow>
              <TableHead>Hero</TableHead>
              <TableHead>Item (from asset)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {HERO_IDS.slice(0, 3).map((heroId, i) => (
              <TableRow key={heroId}>
                <TableCell>
                  <HeroCell heroId={heroId} linkToDetail />
                </TableCell>
                <TableCell>
                  <ItemCell
                    item={items?.find((item) => item.id === SAMPLE_ITEM_IDS[i])}
                    loading={isLoadingItems}
                    linkToDetail
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Specimen>

      <Specimen
        name="HeroImage shape and ring"
        source="domain/assets/HeroImage"
        note="shape crops the transparent portrait: circle wherever it sits on a surface of its own (lists, timelines, the team builder), rounded for the framed portrait of a match card. ring frames it; a tone marks a side or a result, and target is the drop target under a dragged portrait. The size stays a className."
      >
        <Variants label="shape: square, rounded, circle">
          <HeroImage heroId={HERO_IDS[0]} className="size-10" />
          <HeroImage heroId={HERO_IDS[0]} shape="rounded" className="size-10" />
          <HeroImage heroId={HERO_IDS[0]} shape="circle" className="size-10" />
        </Variants>
        <Variants label="ring: border, primary, positive, negative">
          <HeroImage heroId={HERO_IDS[1]} shape="rounded" ring="border" className="size-10" />
          <HeroImage heroId={HERO_IDS[1]} shape="circle" ring="primary" className="size-10" />
          <HeroImage heroId={HERO_IDS[1]} shape="circle" ring="positive" className="size-10" />
          <HeroImage heroId={HERO_IDS[1]} shape="circle" ring="negative" className="size-10" />
          <HeroImage heroId={HERO_IDS[1]} shape="circle" ring="target" className="size-10" />
          <HeroImage heroId={UNKNOWN_ID} shape="circle" ring="border" className="size-10" />
        </Variants>
      </Specimen>

      <Specimen
        name="BadgeImage inline"
        source="domain/assets/BadgeImage"
        note='size="inline" puts a rank badge in a table row or a line of text without growing the row. The badge also recovers when the ranks arrive after the first render, as they do here.'
      >
        <Table density="dense" aria-label="Inline rank badges">
          <TableBody>
            {[116, 64, 999].map((badge) => (
              <TableRow key={badge}>
                <TableCell>Badge {badge}</TableCell>
                <TableCell className="text-end">
                  <BadgeImage badge={badge} ranks={ranks ?? []} size="inline" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Specimen>

      <Specimen
        name="HeroImage art"
        source="domain/assets/HeroImage"
        note='art="portrait" draws the tall hero-card art (3:4) instead of the round minimap head, for the header of a page about the hero (in a ProfileHeaderMedia). A hero without a card falls back to the icon.'
      >
        <Variants label="art: icon, portrait">
          <HeroImage heroId={HERO_IDS[0]} className="size-10" />
          <HeroImage heroId={HERO_IDS[0]} art="portrait" className="w-20" />
        </Variants>
      </Specimen>

      <Specimen
        name="RankedEntityList"
        source="domain/assets/RankedEntityList"
        note="A short leaderboard of heroes or items (best items of a hero, best heroes for an item): one RankedEntityRow per place with the rank, the art, the name linked to its page and a meta line, and RankedEntityMetric children for the numbers. A metric with share draws a bar under its value; tone colors a value that has a pivot; labelDisplay hidden leaves the label to screen readers, so a list can label only its first row. density compact (the item list here) draws smaller art and tighter rows. A metric with change draws a signed bar (DivergingBar) under its value: a gain right of the middle, a loss left, with an optional uncertainty interval. A metric with details opens a hover card from its value (reachable by keyboard; the first row of the third list here). One column in a narrow container, two (filled top to bottom) from @3xl; columns single keeps one (the third list here)."
      >
        <RankedEntityList density="compact">
          {RANKED_HEROES.map(({ heroId, winRate, usage }, index) => (
            <RankedEntityRow key={heroId} rank={index + 1} entity={{ heroId }} meta="12,345 matches">
              <RankedEntityMetric
                label="Win rate"
                value={`${(winRate * 100).toFixed(1)}%`}
                tone={toneOf(winRate, 0.5)}
              />
              <RankedEntityMetric label="Bought" value={`${Math.round(usage * 100)}%`} share={usage} />
            </RankedEntityRow>
          ))}
        </RankedEntityList>
        <RankedEntityList density="compact" columns="single" className="max-w-sm">
          {RANKED_HEROES.slice(0, 3).map(({ heroId, winRate }, index) => (
            <RankedEntityRow key={heroId} rank={index + 1} entity={{ heroId }} meta="12,345 matches">
              <RankedEntityMetric
                label="Change"
                value={`${winRate > 0.5 ? "+" : "−"}${Math.abs((winRate - 0.5) * 100).toFixed(1)} pp`}
                tone={toneOf(winRate, 0.5)}
                change={{
                  value: (winRate - 0.5) * 100,
                  scale: 6,
                  interval: [(winRate - 0.5) * 100 - 1, (winRate - 0.5) * 100 + 1],
                }}
                details={index === 0 ? "Win rate before 47.8%, after 53.2%" : undefined}
              />
            </RankedEntityRow>
          ))}
        </RankedEntityList>
        <RankedEntityList className="max-w-sm">
          {SAMPLE_ITEM_IDS.map((itemId, index) => (
            <RankedEntityRow key={itemId} rank={index + 1} entity={{ itemId }}>
              {/* labelDisplay: the first row labels the columns, the rest stay one line tall. */}
              <RankedEntityMetric
                label="Win rate"
                labelDisplay={index === 0 ? "visible" : "hidden"}
                value="48.0%"
                tone="negative"
              />
              <RankedEntityMetric
                label="Together"
                labelDisplay={index === 0 ? "visible" : "hidden"}
                value="23%"
                share={0.23}
              />
            </RankedEntityRow>
          ))}
        </RankedEntityList>
      </Specimen>

      <Specimen
        name="AbilityOrderGrid"
        source="domain/assets/AbilityOrderGrid"
        note="A skill order: a row per ability in slot order, a column per upgrade, the upgrade's number in its slot color where the ability was taken. pickRate on the steps adds the row of how many players took each step, from @lg. Screen readers get a numbered list of the upgrades instead of the grid."
      >
        <AbilityOrderGrid
          abilityIds={SAMPLE_ABILITY_IDS}
          steps={[0, 1, 0, 2, 0, 3, 1, 1, 2, 2, 3, 0].map((slot, index) => ({
            abilityId: SAMPLE_ABILITY_IDS[slot],
            pickRate: 1 - index * 0.04,
          }))}
        />
      </Specimen>
    </>
  );
}
