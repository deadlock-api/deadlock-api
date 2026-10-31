import type { ItemProperty, Upgrade, UpgradeTooltipSection } from "deadlock_api_client";

import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

// Property texts can be a full sentence; a Badge does not wrap by default and would overflow a narrow card.
const CHIP_WRAP = "shrink whitespace-normal";

function formatProperty(prop: ItemProperty): string | null {
  // The API sends some values as numbers, although the generated client types them as strings.
  // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- see above
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
  const scaling = formatScaling(prop, postfix);
  const text = prop.label ? `${value} ${prop.label}` : value;
  return scaling ? `${text} (${scaling})` : text;
}

// Scale functions whose stat_scale multiplies the hero's spirit power, and those that add it once per boon (level).
// Cooldown, duration and range scale functions carry no stat_scale; they follow the hero's own multipliers.
const SPIRIT_SCALING = new Set(["scale_function_tech_damage", "scale_function_healing_spirit_scale"]);
const BOON_SCALING = new Set(["scale_function_healing_boon_scale"]);

function formatScaling(prop: ItemProperty, postfix: string): string | null {
  const fn = prop.scale_function;
  const scale = fn?.stat_scale;
  if (!fn || !scale) return null;
  const amount = scale.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const stat = fn.specific_stat_scale_type;
  if (stat === "ETechPower" || (fn.class_name && SPIRIT_SCALING.has(fn.class_name))) return `+${amount}× Spirit`;
  if (stat === "ELevelUpBoons" || (fn.class_name && BOON_SCALING.has(fn.class_name))) {
    return `+${amount}${postfix} per Boon`;
  }
  return null;
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
    <div className={cn("flex flex-col gap-3 text-start normal-case", className)}>
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
        <Text variant="caption" tone="muted" className="font-mono font-semibold uppercase">
          {label}
        </Text>
      )}
      {section.section_attributes?.map((attr) => {
        const emphasized = [...(attr.elevated_properties ?? []), ...(attr.important_properties ?? [])];
        const regular = attr.properties ?? [];
        const statusEffects = attr.important_properties_with_icon?.map((p) => p.localized_name).filter(Boolean) ?? [];
        return (
          <div key={JSON.stringify(attr)} className="flex flex-col gap-1.5">
            {attr.loc_string &&
              cleanText(attr.loc_string, hiddenName).map((paragraph) => (
                <p key={paragraph} className="font-sans text-sm leading-snug text-foreground">
                  {paragraph}
                </p>
              ))}
            <div className="flex flex-wrap gap-1.5">
              {emphasized.map((key) => {
                const text = props[key] ? formatProperty(props[key]) : null;
                return text ? (
                  <Badge key={key} variant="soft" shape="square" className={CHIP_WRAP}>
                    {text}
                  </Badge>
                ) : null;
              })}
              {statusEffects.map((name) => (
                <Badge key={name} variant="soft" shape="square" className={CHIP_WRAP}>
                  {name}
                </Badge>
              ))}
              {regular.map((key) => {
                const text = props[key] ? formatProperty(props[key]) : null;
                return text ? (
                  <Badge key={key} variant="muted" shape="square" className={CHIP_WRAP}>
                    {text}
                  </Badge>
                ) : null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
