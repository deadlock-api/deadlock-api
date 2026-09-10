import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { ArrowDown, ArrowRight } from "lucide-react";

import { ItemImageFromAsset } from "~/components/ItemImage";
import { formatPercent } from "~/lib/format";
import { itemSlug } from "~/lib/item-slug";
import { cn } from "~/lib/utils";
import { filterShopableItems, itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const listFormat = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" });

function UpgradeTile({ item, winRate, current }: { item: SlimUpgrade; winRate?: number; current?: boolean }) {
  return (
    <li
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2",
        current ? "border-primary/60 bg-primary/5" : "border-border",
      )}
    >
      <ItemImageFromAsset item={item} className="size-10 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        {current ? (
          <span className="block text-sm leading-tight font-medium">{item.name}</span>
        ) : (
          <Link
            to="/items/$itemName"
            params={{ itemName: itemSlug(item.name) }}
            preload="intent"
            className="block text-sm leading-tight font-medium hover:underline"
          >
            {item.name}
          </Link>
        )}
        <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span>
            T{item.item_tier} · {(item.cost ?? 0).toLocaleString("en-US")}
          </span>
          {winRate !== undefined && <span>{formatPercent(winRate)} win</span>}
        </div>
      </div>
    </li>
  );
}

function PathArrow() {
  return (
    <div aria-hidden className="flex shrink-0 justify-center text-muted-foreground">
      <ArrowDown className="size-4 sm:hidden" />
      <ArrowRight className="hidden size-4 sm:block" />
    </div>
  );
}

export function ItemUpgradePath({
  itemId,
  itemName,
  request,
}: {
  itemId: number;
  itemName: string;
  request: AnalyticsApiItemStatsRequest;
}) {
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

  const column = (list: SlimUpgrade[], label: string) => (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-64 sm:flex-1">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</h3>
      <ul className="flex flex-col gap-2">
        {list.map((entry) => (
          <UpgradeTile key={entry.id} item={entry} winRate={winRates.get(entry.id)} />
        ))}
      </ul>
    </div>
  );

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{itemName} Upgrade Path</h2>
      <p className="text-sm text-muted-foreground">
        {itemName} {summary}. Win rates are for the current patch.
      </p>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {components.length > 0 && (
          <>
            {column(components, "Builds from")}
            <PathArrow />
          </>
        )}
        <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-64 sm:flex-1">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">This item</h3>
          <ul>
            <UpgradeTile item={item} winRate={winRates.get(item.id)} current />
          </ul>
        </div>
        {upgrades.length > 0 && (
          <>
            <PathArrow />
            {column(upgrades, "Upgrades into")}
          </>
        )}
      </div>
    </section>
  );
}
