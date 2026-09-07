import type { ItemProperty, Upgrade, UpgradeTooltipSection } from "deadlock_api_client";

import { cn } from "~/lib/utils";

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

function cleanText(html: string, hiddenName: string | undefined): string[] {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .split(/<br\s*\/?>/i)
    .map((part) => {
      const text = part.replace(/<[^>]*>/g, "");
      return (hiddenName ? text.replace(new RegExp(hiddenName, "gi"), "???") : text).trim();
    })
    .filter((part) => part.length > 0);
}

/** Renders an item's tooltip sections. `hideName` masks the item's own name in the text for guessing games. */
export function ItemEffectCard({
  item,
  className,
  hideName = false,
}: {
  item: Upgrade;
  className?: string;
  hideName?: boolean;
}) {
  const props = item.properties ?? {};
  const sections = item.tooltip_sections ?? [];
  return (
    <div className={cn("flex flex-col gap-3 text-left normal-case", className)}>
      {sections.map((section) => (
        <ItemEffectSection
          key={JSON.stringify(section)}
          section={section}
          props={props}
          hiddenName={hideName ? item.name : undefined}
        />
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
  hiddenName: string | undefined;
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
