import { Specimen } from "~/components/dev/design-system/Specimen";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { TierBadge, TierEmpty, TierItem, TierList, TierRow, TierTile } from "~/components/patterns/tier-list/TierList";
import { Tooltip } from "~/components/ui/tooltip";

const ROWS = [
  { tier: "s", description: "Best", heroes: [1, 2] },
  { tier: "a", description: "Strong", heroes: [4, 6, 7] },
  { tier: "b", description: "Even", heroes: [8, 10, 11, 12, 13, 14, 15] },
  { tier: "c", description: "Weak", heroes: [] },
  { tier: "d", description: "Worst", heroes: [16] },
] as const;

export function TierListSpecimens() {
  return (
    <>
      <Specimen
        name="TierList"
        source="patterns/tier-list/TierList"
        note="Grades S to D, best first. TierRow (tier: s, a, b, c, d; label, description) prints the letter on its tier token, so the hue never carries the grade alone; its entries are a list named after it. TierItem holds one entry, TierTile is its pressable face (a link, or asChild around a router Link), TierEmpty the line of a grade nobody earned. Entries wrap: three to a line at 320px."
      >
        <TierList aria-label="Example tier list">
          {ROWS.map(({ tier, description, heroes }) => (
            <TierRow key={tier} tier={tier} description={description}>
              {heroes.length === 0 ? (
                <TierEmpty />
              ) : (
                heroes.map((heroId, index) => (
                  <TierItem key={heroId}>
                    <Tooltip content={`Hero ${heroId}: ${(55 - index).toFixed(1)}% win rate`}>
                      <TierTile href="#tier-list">
                        <HeroImage heroId={heroId} title="" aria-hidden="true" className="size-12 @md:size-14" />
                        <span className="w-full text-2xs leading-tight font-medium @md:text-xs">Hero {heroId}</span>
                        <span className="text-2xs text-muted-foreground tabular-nums">{(55 - index).toFixed(1)}%</span>
                      </TierTile>
                    </Tooltip>
                  </TierItem>
                ))
              )}
            </TierRow>
          ))}
        </TierList>
      </Specimen>
      <Specimen
        name="TierList zero props"
        source="patterns/tier-list/TierList"
        note="A TierRow without props is a B row; TierEmpty without children says so; a TierTile without props is a plain anchor, and its focus ring is the one FOCUS_RING."
      >
        <TierList aria-label="Zero-prop tier list">
          <TierRow>
            <TierEmpty />
          </TierRow>
          <TierRow tier="s" label="1st">
            <TierItem>
              <TierTile href="#tier-list">Custom label</TierTile>
            </TierItem>
          </TierRow>
        </TierList>
      </Specimen>
      <Specimen
        name="TierBadge"
        source="patterns/tier-list/TierList"
        note="One grade outside a list, such as a hero's tier in the hero page header. tier: s, a, b, c, d; size: sm, default. The letter carries the grade; screen readers hear it as 'S tier'. Without props it is a B."
      >
        <div className="flex items-center gap-2">
          <TierBadge tier="s" />
          <TierBadge tier="a" />
          <TierBadge />
          <TierBadge tier="c" />
          <TierBadge tier="d" />
          <TierBadge tier="a" size="sm" />
        </div>
      </Specimen>
    </>
  );
}
