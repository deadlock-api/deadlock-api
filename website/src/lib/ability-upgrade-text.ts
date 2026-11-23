import type { Ability, ItemProperty } from "deadlock_api_client";

export type UpgradeTier = 1 | 2 | 3;

export const UPGRADE_TIERS: readonly UpgradeTier[] = [1, 2, 3];

/** The ability points each upgrade tier costs. */
export const UPGRADE_TIER_COST: Record<UpgradeTier, number> = { 1: 1, 2: 2, 3: 5 };

/** A piece of a line of upgrade text; `highlight` is a number or keyword the game stresses. */
export interface TextRun {
  text: string;
  highlight: boolean;
}

export type UpgradeLine = TextRun[];

const DESCRIPTION_KEY = { 1: "t1_desc", 2: "t2_desc", 3: "t3_desc" } as const;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "")
    .replace(/\s+/g, " ");
}

/** The game's upgrade text (highlight spans, `<br>` line breaks, inline svg icons) as lines of text runs. */
export function parseUpgradeHtml(html: string): UpgradeLine[] {
  const highlight = /<span[^>]*class="[^"]*highlight[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .split(/<br\s*\/?>/i)
    .map((line) => {
      const runs: TextRun[] = [];
      const push = (part: string, isHighlight: boolean) => {
        const text = plainText(part);
        if (text.length > 0) runs.push({ text, highlight: isHighlight });
      };
      let last = 0;
      for (const match of line.matchAll(highlight)) {
        push(line.slice(last, match.index), false);
        push(match[1] ?? "", true);
        last = match.index + match[0].length;
      }
      push(line.slice(last), false);
      return trimRuns(runs);
    })
    .filter((line) => line.length > 0);
}

function trimRuns(runs: TextRun[]): TextRun[] {
  const trimmed = runs.map((run, index) => ({
    ...run,
    text: index === 0 ? run.text.trimStart() : run.text,
  }));
  const last = trimmed.at(-1);
  if (last) last.text = last.text.trimEnd();
  return trimmed.filter((run) => run.text.length > 0);
}

/** "+4m", "-10s", "+18%": an upgrade's bonus with the property's sign and unit. */
export function formatBonus(bonus: string | number, property: ItemProperty | undefined): string {
  // Some units come with a space (" m"); the bonus is written without one.
  const postfix = (property?.postfix ?? "").trim();
  let value = String(bonus).trim();
  // Distances come with their unit ("4m") and the property names it again.
  if (postfix && value.endsWith(postfix)) value = value.slice(0, -postfix.length);
  const number = Number(value);
  const numeric = value.length > 0 && Number.isFinite(number);
  if (numeric) value = String(Math.round(number * 100) / 100);
  let sign = "";
  if (!value.startsWith("-")) {
    if (property?.prefix === "-") sign = "-";
    else if (!numeric || number > 0) sign = "+";
  }
  return `${sign}${value}${postfix}`;
}

/** "SpeedOnLand" as "Speed On Land", for a property the game gives no label. */
function humanize(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/**
 * What an ability's upgrade of `tier` does: the game's own text when it has one, else a line per property it changes
 * ("-10s Cooldown"). Empty when the ability has no such upgrade.
 */
export function upgradeLines(ability: Pick<Ability, "description" | "upgrades" | "properties">, tier: UpgradeTier) {
  const html = ability.description[DESCRIPTION_KEY[tier]];
  if (html) {
    const lines = parseUpgradeHtml(html);
    if (lines.length > 0) return lines;
  }
  const upgrade = ability.upgrades?.[tier - 1];
  return (upgrade?.property_upgrades ?? []).map((change): UpgradeLine => {
    const property = ability.properties?.[change.name];
    const label = property?.label || humanize(change.name);
    return [
      { text: formatBonus(change.bonus, property), highlight: true },
      { text: ` ${label}`, highlight: false },
    ];
  });
}
