import { useQuery } from "@tanstack/react-query";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemCell, ItemCellFromAsset } from "~/components/domain/assets/ItemCell";
import { RankedEntityCard, RankedEntityGrid } from "~/components/domain/assets/RankedEntityGrid";
import { KeyValue } from "~/components/ui/key-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

const HERO_IDS = [1, 2, 3, 4];
const ITEM_IDS = [1548066885, 968099481, 2678489038];
const UNKNOWN_ID = 0;
const RANKED_HEROES = [
  { heroId: 1, winRate: "54.2%", usage: "31%" },
  { heroId: 2, winRate: "53.1%", usage: "12%" },
  { heroId: 3, winRate: "52.8%", usage: "44%" },
  { heroId: 4, winRate: "52.0%", usage: "8%" },
];

export function Round3DomainAssets() {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const { data: items, isLoading: isLoadingItems } = useQuery(itemUpgradesQueryOptions);

  return (
    <>
      <Specimen
        name="HeroCell and ItemCell"
        source="domain/assets/HeroCell · domain/assets/ItemCell"
        note="The identity of a table or list row: image and name on one line, the name truncating to the width the parent leaves. ItemCellFromAsset renders an item the table already holds, so a long table keeps one subscription."
      >
        <Variants label="size: default, sm · linkToDetail">
          <HeroCell heroId={HERO_IDS[0]} />
          <HeroCell heroId={HERO_IDS[1]} linkToDetail />
          <HeroCell heroId={HERO_IDS[2]} size="sm" className="text-xs" />
          <ItemCell itemId={ITEM_IDS[0]} />
          <ItemCell itemId={ITEM_IDS[1]} linkToDetail />
          <ItemCell itemId={ITEM_IDS[2]} size="sm" className="text-xs" />
        </Variants>
        <Variants label='shape="circle", truncation (max-w-24 on the cell), unknown id, loading'>
          <HeroCell heroId={HERO_IDS[3]} shape="circle" />
          <HeroCell heroId={HERO_IDS[1]} linkToDetail className="max-w-24" />
          <ItemCell itemId={ITEM_IDS[0]} linkToDetail className="max-w-24" />
          <HeroCell heroId={UNKNOWN_ID} />
          <ItemCell itemId={UNKNOWN_ID} />
          <ItemCellFromAsset item={undefined} loading />
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
                  <ItemCellFromAsset
                    item={items?.find((item) => item.id === ITEM_IDS[i])}
                    loading={isLoadingItems}
                    size="sm"
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
        note="shape crops the transparent portrait: circle wherever it sits on a surface of its own (lists, timelines, the team builder), rounded for the framed portrait of a match card. ring frames it; a tone marks a side or a result. The size stays a className."
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
        name="RankedEntityGrid"
        source="domain/assets/RankedEntityGrid"
        note="A short leaderboard of heroes or items (best items of a hero, best heroes for an item): rank, image, the name linked to its page, and KeyValue rows for the numbers. Two columns in a narrow container, four in a wide one."
      >
        <RankedEntityGrid>
          {RANKED_HEROES.map(({ heroId, winRate, usage }, index) => (
            <RankedEntityCard key={heroId} rank={index + 1} entity={{ heroId }} title="12,345 matches">
              <KeyValue label="Win" value={winRate} />
              <KeyValue label="Bought" value={usage} />
            </RankedEntityCard>
          ))}
        </RankedEntityGrid>
        <RankedEntityGrid>
          {ITEM_IDS.map((itemId, index) => (
            <RankedEntityCard key={itemId} rank={index + 1} entity={{ itemId }}>
              <KeyValue label="Win" value="55.0%" />
              <KeyValue label="Together" value="23%" />
            </RankedEntityCard>
          ))}
        </RankedEntityGrid>
      </Specimen>
    </>
  );
}
