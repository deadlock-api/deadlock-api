import {
  ABILITY_POINTS,
  ABILITY_UNLOCK,
  type HeroBuild,
  type HeroBuildCurrencyChange,
  type HeroBuildModCategory,
} from "~/lib/wasm/hero-build";

/**
 * The Build Designer's build and Deadlock's in-game build codes, both ways. The designer keeps items by stage
 * (`${column}:${itemId}`) and a skill order of upgrades; a game build keeps named item groups and its ability unlocks
 * and upgrades. What only one side has stays behind: the designer's planned sales and flex slot times, the game's
 * sell priorities, annotations and imbue targets.
 */
export interface DesignerBuild {
  heroId: number | null;
  name: string;
  /** `${column}:${itemId}`, in order. */
  path: string[];
  /** Ability ids by upgrade. */
  skills: number[];
}

// Must match TIME_PHASE_BOUNDARIES on the API (0-9m, 9-20m, 20-30m, 30m+).
const TIME_PHASE_LABELS = ["0–9m", "9–20m", "20–30m", "30m+"] as const;
export const PHASE_COUNT = TIME_PHASE_LABELS.length;
// Street brawl stages are rounds rather than time phases.
export const STREET_BRAWL_ROUNDS = 8;

export function stageLabel(column: number, isStreetBrawl: boolean): string {
  if (isStreetBrawl) return `Round ${column + 1}`;
  return TIME_PHASE_LABELS[column] ?? `Stage ${column + 1}`;
}

/** The mode's stages by name: what a game build's item groups map onto, and what an exported build's are named. */
export function stageNames(isStreetBrawl: boolean): string[] {
  const count = isStreetBrawl ? STREET_BRAWL_ROUNDS : PHASE_COUNT;
  return Array.from({ length: count }, (_, column) => stageLabel(column, isStreetBrawl));
}

/** The Build Designer's URL with a (normal-mode) build open in it. */
export function designerHref(build: DesignerBuild): string {
  const search = new URLSearchParams();
  if (build.heroId != null) search.set("hero", String(build.heroId));
  if (build.path.length > 0) search.set("build_path", build.path.join(","));
  if (build.skills.length > 0) search.set("build_skills", build.skills.join(","));
  return `/analytics/items/build-flow?${search}`;
}

// An item group's width in the game's editor grows by an item's (as in the game's own default builds).
const GROUP_WIDTH_PER_ITEM = 90;
const GROUP_WIDTH_PADDING = 5;
const GROUP_HEIGHT = 171;
/** What an ability's first, second and third upgrade cost in ability points. */
const UPGRADE_COSTS = [1, 2, 5] as const;

/**
 * A game build in the designer with `stageNames.length` stages. A group named like a stage (a build exported from
 * here) goes to that stage; any other goes by position (early, mid and late game to the first three), the ones past
 * the last stage to it. An item in two groups stays in the first.
 */
export function designerBuildFromGame(build: HeroBuild, stageNames: readonly string[]): DesignerBuild {
  const lastColumn = stageNames.length - 1;
  const seen = new Set<number>();
  const path: string[] = [];
  (build.details?.mod_categories ?? []).forEach((group, index) => {
    const named = group.name != null ? stageNames.indexOf(group.name) : -1;
    const column = named >= 0 ? named : Math.min(index, lastColumn);
    for (const mod of group.mods) {
      if (mod.ability_id == null || seen.has(mod.ability_id)) continue;
      seen.add(mod.ability_id);
      path.push(`${column}:${mod.ability_id}`);
    }
  });
  const skills = (build.details?.ability_order?.currency_changes ?? []).flatMap((change) =>
    change.currency_type === ABILITY_POINTS && change.ability_id != null ? [change.ability_id] : [],
  );
  return { heroId: build.hero_id, name: build.name ?? "", path, skills };
}

/**
 * A designer build as a game build: a group per stage with items, named after the stage, and the skill order with
 * every ability of `abilities` (the hero's four, in slot order) unlocked first, the upgraded ones in the order of
 * their first upgrade.
 */
export function gameBuildFromDesigner({
  heroId,
  name,
  path,
  skills,
  abilities,
  stageNames,
  now = Date.now(),
}: DesignerBuild & {
  abilities: readonly number[];
  stageNames: readonly string[];
  /** Unix milliseconds, the build's last update. */
  now?: number;
}): HeroBuild {
  const groups: HeroBuildModCategory[] = stageNames.flatMap((stageName, column) => {
    const items = path.flatMap((key) => {
      const [keyColumn, itemId] = key.split(":").map(Number);
      return keyColumn === column && Number.isInteger(itemId) ? [itemId] : [];
    });
    if (items.length === 0) return [];
    return [
      {
        mods: items.map((itemId) => ({
          ability_id: itemId,
          annotation: null,
          required_flex_slots: null,
          sell_priority: null,
          imbue_target_ability_id: null,
        })),
        name: stageName,
        description: null,
        width: items.length * GROUP_WIDTH_PER_ITEM + GROUP_WIDTH_PADDING,
        height: GROUP_HEIGHT,
        optional: null,
      },
    ];
  });

  const upgraded = new Map<number, number>();
  const upgrades: HeroBuildCurrencyChange[] = skills.flatMap((abilityId) => {
    const done = upgraded.get(abilityId) ?? 0;
    if (done >= UPGRADE_COSTS.length) return [];
    upgraded.set(abilityId, done + 1);
    return [{ ability_id: abilityId, currency_type: ABILITY_POINTS, delta: -UPGRADE_COSTS[done], annotation: null }];
  });
  const unlocks: HeroBuildCurrencyChange[] = [...new Set([...upgraded.keys(), ...abilities])].map((abilityId) => ({
    ability_id: abilityId,
    currency_type: ABILITY_UNLOCK,
    delta: -1,
    annotation: null,
  }));

  return {
    hero_build_id: null,
    hero_id: heroId,
    author_account_id: null,
    last_updated_timestamp: Math.floor(now / 1000),
    name,
    description: null,
    language: 0,
    version: null,
    origin_build_id: null,
    details: {
      mod_categories: groups,
      ability_order: upgrades.length > 0 ? { currency_changes: [...unlocks, ...upgrades] } : null,
    },
    tags: [],
    development_build: null,
    publish_timestamp: null,
  };
}
