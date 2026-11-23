import { MaskedIcon } from "~/components/ui/masked-icon";
import { cn } from "~/lib/utils";

const ASSETS = "https://assets-bucket.deadlock-api.com/assets-api-res";

/**
 * The game's own HUD art from the assets API. Each is a white glyph on transparency, drawn through `MaskedIcon`, so
 * its color is the text color around it (a token) rather than the bitmap's.
 */
export const GAME_GLYPH = {
  soul: `${ASSETS}/icons/hud/icons/icon_soul.svg`,
  abilityPoint: `${ASSETS}/images/hud/ap_icon.png`,
  pipEmpty: `${ASSETS}/images/hud/hero_ability_pip_empty.png`,
  pipUpgraded: `${ASSETS}/images/hud/hero_ability_pip_upgraded.png`,
  locked: `${ASSETS}/images/hud/core/locked_icon.png`,
} as const;

const UPGRADE_STEPS = [1, 2, 3] as const;

/**
 * An ability's three upgrades as the HUD shows them under its icon: a diamond per tier, the bought ones struck with a
 * bolt. Read out as `label`; without one the pips are decorative (the text beside them says the tier).
 */
export function UpgradePips({ tier, label, className }: { tier: number; label?: string; className?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {UPGRADE_STEPS.map((step) => (
        <MaskedIcon
          key={step}
          src={step <= tier ? GAME_GLYPH.pipUpgraded : GAME_GLYPH.pipEmpty}
          className={cn("size-3", step <= tier ? "text-warning" : "text-muted-foreground")}
        />
      ))}
    </span>
  );
}

/** A soul amount as the game prices things: the soul glyph, then the number. */
export function SoulAmount({ souls, className }: { souls: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <MaskedIcon src={GAME_GLYPH.soul} className="size-4 text-foreground" />
      {souls.toLocaleString("en-US")}
      <span className="sr-only"> souls</span>
    </span>
  );
}

/** An ability point cost: the number, then the game's ability point glyph. */
export function AbilityPointCost({ points, className }: { points: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      {points}
      <MaskedIcon src={GAME_GLYPH.abilityPoint} label="AP" className="size-4" />
    </span>
  );
}
