import { cva, type VariantProps } from "class-variance-authority";

import { MaskedIcon } from "~/components/ui/masked-icon";
import { cn } from "~/lib/utils";

const ICONS = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";
const IMAGES = "https://assets-bucket.deadlock-api.com/assets-api-res/images";

/**
 * The game's own HUD and minimap art by what it stands for. `ink` art is a one-color glyph: only its shape is used, and
 * it takes the text color around it (a token). `art` keeps the picture's own colors (the urn, a medal, a lane badge).
 */
const GAME_ICONS = {
  soul: { paint: "ink", src: `${ICONS}/hud/icons/icon_soul.svg`, label: "Souls" },
  souls: { paint: "ink", src: `${ICONS}/hud/icons/icon_souls.svg`, label: "Souls" },
  kill: { paint: "ink", src: `${ICONS}/replay/icon_kill.svg`, label: "Kills" },
  death: { paint: "ink", src: `${ICONS}/icons/properties/death.svg`, label: "Deaths" },
  assist: { paint: "ink", src: `${ICONS}/icons/icon_team.svg`, label: "Assists" },
  damage: { paint: "ink", src: `${ICONS}/icons/properties/damage_crit.svg`, label: "Damage" },
  headshot: { paint: "ink", src: `${ICONS}/builds/citadel_build_tag_headshots.svg`, label: "Headshots" },
  weapon: { paint: "ink", src: `${ICONS}/icons/properties/damage_weapon.svg`, label: "Weapon" },
  bullets: { paint: "ink", src: `${ICONS}/hud/core/icon_damage_bullet.svg`, label: "Bullets" },
  spirit: { paint: "ink", src: `${ICONS}/icons/properties/spirit.svg`, label: "Spirit" },
  melee: { paint: "ink", src: `${ICONS}/icons/properties/melee.svg`, label: "Melee" },
  parry: { paint: "ink", src: `${ICONS}/icons/properties/melee_parry.svg`, label: "Parry" },
  health: { paint: "ink", src: `${ICONS}/icons/properties/health.svg`, label: "Health" },
  armor: { paint: "ink", src: `${ICONS}/icons/properties/armor.svg`, label: "Damage mitigated" },
  clock: { paint: "ink", src: `${ICONS}/icons/icon_time_late.svg`, label: "Match time" },
  heal: { paint: "ink", src: `${ICONS}/icons/properties/heal.svg`, label: "Healing" },
  healReduction: { paint: "ink", src: `${ICONS}/icons/properties/debuff_healing_reduction.svg`, label: "Anti-heal" },
  stun: { paint: "ink", src: `${ICONS}/icons/properties/condition_stun.svg`, label: "Crowd control" },
  lanes: { paint: "ink", src: `${ICONS}/icons/icon_lanes.svg`, label: "Lane troopers" },
  guardian: { paint: "ink", src: `${ICONS}/minimap/objective_icon_t1.svg`, label: "Guardian" },
  walker: { paint: "ink", src: `${ICONS}/minimap/objective_icon_t2.svg`, label: "Walker" },
  midBoss: { paint: "ink", src: `${ICONS}/hud/icons/rejuvenator.svg`, label: "Mid Boss" },
  crate: { paint: "ink", src: `${ICONS}/minimap/item_crate_spawn_psd.png`, label: "Breakables" },
  hiddenKing: { paint: "ink", src: `${ICONS}/hud/core/team1_icon.svg`, label: "The Hidden King" },
  archmother: { paint: "ink", src: `${ICONS}/hud/core/team2_icon.svg`, label: "The Archmother" },
  // `zoom`: the art sits small in a wide empty canvas, so it is drawn at twice the box to read at the same size.
  neutrals: { paint: "art", src: `${ICONS}/minimap/neutral_large_psd.png`, label: "Neutral camps", zoom: true },
  urn: { paint: "art", src: `${IMAGES}/shop/images/minimap/soul_jar_marker.webp`, label: "Soul Urn" },
  idol: { paint: "art", src: `${IMAGES}/hud/data_feed_golden_idol.webp`, label: "Golden Statue" },
  mvp: { paint: "art", src: `${ICONS}/post_game/mvp_trophy.svg`, label: "MVP", zoom: true },
  medalGold: { paint: "art", src: `${IMAGES}/shop/images/post_game/medal_gold.webp`, label: "Gold medal" },
  medalSilver: { paint: "art", src: `${IMAGES}/shop/images/post_game/medal_silver.webp`, label: "Silver medal" },
  medalBronze: { paint: "art", src: `${IMAGES}/shop/images/post_game/medal_bronze.webp`, label: "Bronze medal" },
  laneYellow: { paint: "art", src: `${ICONS}/hud/icon_lane_yellow.svg`, label: "Yellow lane" },
  laneBlue: { paint: "art", src: `${ICONS}/hud/icon_lane_blue.svg`, label: "Blue lane" },
  laneGreen: { paint: "art", src: `${ICONS}/hud/icon_lane_green.svg`, label: "Green lane" },
} as const satisfies Record<string, { paint: "ink" | "art"; src: string; label: string; zoom?: boolean }>;

export type GameIconName = keyof typeof GAME_ICONS;

const gameIconVariants = cva("inline-block shrink-0", {
  variants: {
    /** `sm` sits in a line of text or a label, `default` leads a row, `lg` and `xl` stand beside a headline number. */
    size: { sm: "size-4", default: "size-5", lg: "size-8", xl: "size-12", "2xl": "size-16" },
  },
  defaultVariants: { size: "default" },
});

/**
 * A piece of the game's HUD art: a soul, a skull, the MVP trophy, a lane badge. Decorative unless `label` names it
 * (the text beside it usually does); `ink` glyphs are painted in the current text color, so a `text-*` token on it or
 * its parent tones it.
 */
export function GameIcon({
  name = "soul",
  size,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof gameIconVariants> & {
    /** Which art. */
    name?: GameIconName;
    /** What it stands for, read by assistive technology. Leave it out where the text beside it says the same. */
    label?: string;
  }) {
  const icon = GAME_ICONS[name];
  const look = cn(gameIconVariants({ size }), className);
  if (icon.paint === "ink") {
    return (
      <MaskedIcon data-slot="game-icon" data-name={name} src={icon.src} label={label} className={look} {...props} />
    );
  }
  return (
    <span
      data-slot="game-icon"
      data-name={name}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={look}
      {...props}
    >
      <img
        src={icon.src}
        alt=""
        loading="lazy"
        className={cn("size-full object-contain", "zoom" in icon && icon.zoom && "scale-200")}
      />
    </span>
  );
}

/** The name each icon stands for, for a label or a legend that needs it in words. */
export const gameIconLabel = (name: GameIconName) => GAME_ICONS[name].label;
