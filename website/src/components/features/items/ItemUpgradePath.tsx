import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { ArrowDown } from "lucide-react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { Card } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import { TextLink } from "~/components/ui/text-link";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { formatPercent } from "~/lib/format";
import { itemSlug } from "~/lib/item-slug";
import { filterShopableItems, itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const listFormat = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" });

function UpgradeTile({ item, winRate, current }: { item: SlimUpgrade; winRate?: number; current?: boolean }) {
  return (
    <li>
      <Card tone={current ? "primary" : "card"} size="xs" className="w-full flex-row items-center gap-3 px-3">
        <ItemImage item={item} className="size-10 shrink-0" />
        <Stack gap={0.5} className="flex-1">
          {current ? (
            <span className="text-sm leading-tight font-medium">{item.name}</span>
          ) : (
            <TextLink asChild tone="inherit" className="text-sm leading-tight font-medium">
              <Link to="/analytics/items/$itemName" params={{ itemName: itemSlug(item.name) }} preload="intent">
                {item.name}
              </Link>
            </TextLink>
          )}
          <div className="flex flex-wrap justify-between gap-x-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            <span>
              T{item.item_tier} · {(item.cost ?? 0).toLocaleString("en-US")}
            </span>
            {winRate !== undefined && <span>{formatPercent(winRate)} win</span>}
          </div>
        </Stack>
      </Card>
    </li>
  );
}

function PathArrow() {
  return (
    <div aria-hidden className="flex shrink-0 justify-center text-muted-foreground">
      <ArrowDown className="size-4" />
    </div>
  );
}

export function ItemUpgradePath({
  itemId,
  itemName,
  request,
  rankRange,
  className,
}: {
  className?: string;
  itemId: number;
  itemName: string;
  request: AnalyticsApiItemStatsRequest;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const period = useDefaultPeriodLabel();
  const { data: allItems } = useQuery(itemUpgradesQueryOptions);
  const { data: stats } = useQuery(itemStatsQueryOptions(request));

  const items = filterShopableItems(allItems ?? []);
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const components = items.filter((candidate) => item.component_items?.includes(candidate.class_name));
  const upgrades = items.filter((candidate) => candidate.component_items?.includes(item.class_name));
  if (components.length === 0 && upgrades.length === 0) return null;

  const winRates = new Map(stats?.map((row) => [row.item_id, row.wins / row.matches]));
  const names = (list: SlimUpgrade[]) => listFormat.format(list.map((entry) => entry.name));
  const summary = [
    components.length > 0 && `builds from ${names(components)}`,
    upgrades.length > 0 && `upgrades into ${names(upgrades)}`,
  ]
    .filter(Boolean)
    .join(" and ");

  const group = (list: SlimUpgrade[], label: string, current?: boolean) => (
    <div className="flex min-w-0 flex-col gap-2">
      <Heading as="h4" size="eyebrow">
        {label}
      </Heading>
      <ul className="grid gap-2 @md:grid-cols-2">
        {list.map((entry) => (
          <UpgradeTile key={entry.id} item={entry} winRate={winRates.get(entry.id)} current={current} />
        ))}
      </ul>
    </div>
  );

  return (
    <Panel className={className}>
      <PanelHeader title="Upgrade Path" description={`Win rates · ${rankRange}`} />
      <PanelBody className="@container flex flex-1 flex-col gap-2">
        {components.length > 0 && (
          <>
            {group(components, "Builds from")}
            <PathArrow />
          </>
        )}
        {group([item], "This item", true)}
        {upgrades.length > 0 && (
          <>
            <PathArrow />
            {group(upgrades, "Upgrades into")}
          </>
        )}
      </PanelBody>
      <PanelFooter>
        {itemName} {summary}. Win rates are for {rankRange} matches in {period}.
      </PanelFooter>
    </Panel>
  );
}
