import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { GameIcon, type GameIconName, gameIconLabel } from "~/components/domain/assets/GameIcon";
import { NpcImage, type NpcUnit } from "~/components/domain/assets/NpcImage";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";

const INK: GameIconName[] = [
  "soul",
  "souls",
  "kill",
  "death",
  "assist",
  "damage",
  "headshot",
  "weapon",
  "bullets",
  "spirit",
  "melee",
  "parry",
  "health",
  "armor",
  "clock",
  "heal",
  "healReduction",
  "stun",
  "lanes",
  "guardian",
  "walker",
  "midBoss",
  "crate",
  "hiddenKing",
  "archmother",
];
const ART: GameIconName[] = [
  "neutrals",
  "urn",
  "idol",
  "mvp",
  "medalGold",
  "medalSilver",
  "medalBronze",
  "laneYellow",
  "laneBlue",
  "laneGreen",
];
const UNITS: NpcUnit[] = ["guardian", "walker", "patron", "hiddenKing", "archmother"];

/** The game's own HUD art and unit portraits (domain/assets), for numbers that are about the game's things. */
export function DomainGameArt() {
  return (
    <>
      <Specimen
        name="GameIcon"
        source="domain/assets/GameIcon"
        note="The game's HUD and minimap art by what it stands for (name). Ink glyphs take the text color around them (a token: text-item-weapon, text-primary, text-muted-foreground); art keeps its own colors (the urn, the medals, the lane badges). Decorative unless label names it, so it never repeats the word printed beside it. size: sm (in a label), default, lg, xl and 2xl (beside a StoryFigure)."
      >
        <Variants label="ink: painted in the text color" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {INK.map((name) => (
            <Stack key={name} align="center" gap={1}>
              <GameIcon name={name} size="lg" label={gameIconLabel(name)} />
              <Text variant="caption" tone="muted">
                {name}
              </Text>
            </Stack>
          ))}
        </Variants>
        <Variants label="art: its own colors" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {ART.map((name) => (
            <Stack key={name} align="center" gap={1}>
              <GameIcon name={name} size="lg" label={gameIconLabel(name)} />
              <Text variant="caption" tone="muted">
                {name}
              </Text>
            </Stack>
          ))}
        </Variants>
        <Variants label='size="sm" | "default" | "lg" | "xl" | "2xl" · tones from the text color · zero props (a soul)'>
          <GameIcon name="soul" size="sm" />
          <GameIcon name="soul" />
          <GameIcon name="soul" size="lg" />
          <GameIcon name="soul" size="xl" />
          <GameIcon name="soul" size="2xl" />
          <GameIcon name="bullets" size="lg" className="text-item-weapon" />
          <GameIcon name="spirit" size="lg" className="text-item-spirit" />
          <GameIcon name="melee" size="lg" className="text-item-vitality" />
          <GameIcon name="kill" size="lg" className="text-primary" />
          <GameIcon name="death" size="lg" className="text-muted-foreground" />
          <GameIcon />
        </Variants>
        <Variants label="In a Stat (icon): before the label, which names it" className="block">
          <StatGroup size="sm" className="grid-cols-2 sm:grid-cols-4">
            <Stat icon={<GameIcon name="lanes" size="sm" />} label="Last hits" value="541,109" sub="8,182 denies" />
            <Stat icon={<GameIcon name="idol" size="sm" />} label="Statue buffs" value="12,882" />
            <Stat icon={<GameIcon name="medalGold" size="sm" />} label="MVP" value="214" sub="9.2%" />
            <Stat
              align="center"
              icon={<GameIcon name="stun" size="sm" />}
              label="Crowd control, a label long enough to truncate"
              value="1,204 min"
            />
          </StatGroup>
        </Variants>
      </Specimen>

      <Specimen
        name="NpcImage"
        source="domain/assets/NpcImage"
        note="A non-hero unit as the game portrays it: unit guardian, walker, patron, or a side's Patron (hiddenKing, archmother). alt is the unit's name; decorative where the name is printed beside it. size: sm, default, lg; loading shows a skeleton of the same box."
      >
        <Variants label="unit (size lg, named by alt)">
          {UNITS.map((unit) => (
            <NpcImage key={unit} unit={unit} size="lg" />
          ))}
        </Variants>
        <Variants label='size="sm" | "default" | "lg" · decorative beside its name · zero props (the Patron)'>
          <NpcImage unit="hiddenKing" size="sm" />
          <NpcImage unit="hiddenKing" />
          <NpcImage unit="hiddenKing" size="lg" />
          <Stack gap={0.5} align="center">
            <NpcImage unit="archmother" decorative />
            <Text variant="label">The Archmother</Text>
          </Stack>
          <NpcImage />
        </Variants>
      </Specimen>
    </>
  );
}
