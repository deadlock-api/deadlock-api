import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ItemProperty, Upgrade, UpgradeTooltipSection } from "deadlock_api_client";
import { useMemo, useState } from "react";

import { FlashcardGame } from "~/components/flashcards/FlashcardGame";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { seo } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

type Direction = "effects-to-name" | "name-to-effects";

export const Route = createFileRoute("/flashcards/item-effects")({
  component: ItemEffectFlashcards,
  head: () =>
    seo({
      title: "Item Effect Flashcards - Learn What Items Do | Deadlock API",
      description:
        "Learn what Deadlock shop items do. Identify items from their stats and effects, or match a named item to its effects.",
      path: "/flashcards/item-effects",
    }),
});

function formatProperty(prop: ItemProperty): string | null {
  const raw = String(prop.value ?? "").trim();
  if (raw === "" || raw === prop.disable_value) return null;
  const postfix = (prop.postfix ?? "").trim();
  let value = raw.endsWith(postfix) ? raw : raw + postfix;
  const prefix = prop.prefix ?? "";
  if (prefix === "{s:sign}") {
    if (!raw.startsWith("-") && !raw.startsWith("+")) value = `+${value}`;
  } else if (prefix && !raw.startsWith(prefix)) {
    value = prefix + value;
  }
  return prop.label ? `${value} ${prop.label}` : value;
}

function cleanText(html: string, hiddenName: string): string[] {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .split(/<br\s*\/?>/i)
    .map((part) =>
      part
        .replace(/<[^>]*>/g, "")
        .replace(new RegExp(hiddenName, "gi"), "???")
        .trim(),
    )
    .filter((part) => part.length > 0);
}

function ItemEffectCard({ item, className }: { item: Upgrade; className?: string }) {
  const props = item.properties ?? {};
  const sections = item.tooltip_sections ?? [];
  return (
    <div className={cn("flex flex-col gap-3 text-left normal-case", className)}>
      {sections.map((section) => (
        <ItemEffectSection key={JSON.stringify(section)} section={section} props={props} hiddenName={item.name} />
      ))}
    </div>
  );
}

function ItemEffectSection({
  section,
  props,
  hiddenName,
}: {
  section: UpgradeTooltipSection;
  props: Record<string, ItemProperty>;
  hiddenName: string;
}) {
  const label = section.section_type;
  return (
    <div className="flex flex-col gap-1.5">
      {label && label !== "innate" && (
        <span className="font-mono text-[10px] tracking-widest text-primary/70 uppercase">{label}</span>
      )}
      {section.section_attributes?.map((attr) => {
        const emphasized = [...(attr.elevated_properties ?? []), ...(attr.important_properties ?? [])];
        const regular = attr.properties ?? [];
        const statusEffects = attr.important_properties_with_icon?.map((p) => p.localized_name).filter(Boolean) ?? [];
        return (
          <div key={JSON.stringify(attr)} className="flex flex-col gap-1.5">
            {attr.loc_string &&
              cleanText(attr.loc_string, hiddenName).map((paragraph) => (
                <p key={paragraph} className="font-sans text-sm leading-snug text-foreground/90">
                  {paragraph}
                </p>
              ))}
            <div className="flex flex-wrap gap-1.5">
              {emphasized.map((key) => {
                const text = props[key] ? formatProperty(props[key]) : null;
                return text ? (
                  <span key={key} className="border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {text}
                  </span>
                ) : null;
              })}
              {statusEffects.map((name) => (
                <span key={name} className="border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {name}
                </span>
              ))}
              {regular.map((key) => {
                const text = props[key] ? formatProperty(props[key]) : null;
                return text ? (
                  <span
                    key={key}
                    className="border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {text}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemEffectFlashcards() {
  const { data: items, isLoading } = useQuery(itemUpgradesQueryOptions);
  const [direction, setDirection] = useState<Direction>("effects-to-name");

  const pool = useMemo(() => {
    if (!items) return [];
    return filterShopableItems(items).filter((item) => (item.tooltip_sections?.length ?? 0) > 0);
  }, [items]);

  const effectsToName = direction === "effects-to-name";

  return (
    <FlashcardGame
      title="Item Effect Flashcards"
      subtitle={
        effectsToName
          ? "Identify the shop item from its stats and effects. Pick the correct name."
          : "Pick the stats and effects that belong to the named item."
      }
      pool={pool}
      promptClassName="w-full max-w-xl"
      renderPrompt={(item) =>
        effectsToName ? (
          <ItemEffectCard item={item} className="p-5" />
        ) : (
          <div className="flex items-center gap-4 p-5">
            <img
              src={item.shop_image_webp ?? ""}
              alt={item.name}
              className="size-16 shrink-0 object-contain"
              draggable={false}
            />
            <span className="font-game text-2xl tracking-tight uppercase">{item.name}</span>
          </div>
        )
      }
      renderOption={
        effectsToName ? undefined : (item) => <ItemEffectCard item={item} className="w-full py-1 font-normal" />
      }
      controls={
        <ToggleGroup
          type="single"
          value={direction}
          onValueChange={(v) => v && setDirection(v as Direction)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="effects-to-name" className="px-3 text-xs">
            Effects → Name
          </ToggleGroupItem>
          <ToggleGroupItem value="name-to-effects" className="px-3 text-xs">
            Name → Effects
          </ToggleGroupItem>
        </ToggleGroup>
      }
      isLoading={isLoading}
      storageKey="flashcards:item-effects:no-repeats"
      masteredLabel="All item effects mastered"
    />
  );
}
