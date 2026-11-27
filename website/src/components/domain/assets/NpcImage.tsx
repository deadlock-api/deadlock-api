import { cva, type VariantProps } from "class-variance-authority";

import { AssetImage } from "~/components/domain/assets/AssetImage";
import { cn } from "~/lib/utils";

const NPCS = "https://assets-bucket.deadlock-api.com/assets-api-res/images/npcs";

/** The portraits the game draws for its non-hero units, by unit. The patrons are the two sides' bosses. */
const NPC_ART = {
  guardian: { file: "tier_1_boss", name: "Guardian" },
  walker: { file: "tier_2_boss", name: "Walker" },
  patron: { file: "patron", name: "Patron" },
  hiddenKing: { file: "patron_hiddenking", name: "The Hidden King" },
  archmother: { file: "patron_archmother", name: "The Archmother" },
} as const;

export type NpcUnit = keyof typeof NPC_ART;

const npcImageVariants = cva("aspect-square object-contain", {
  variants: {
    /** `sm` beside a line of text, `default` leads a card, `lg` is the subject of a card. */
    size: { sm: "size-8", default: "size-12", lg: "size-20" },
  },
  defaultVariants: { size: "default" },
});

/**
 * A non-hero unit as the game portrays it: a Guardian, a Walker, a Patron, or one side's Patron (The Hidden King, The
 * Archmother). `decorative` beside a printed name, so the name is read once.
 */
export function NpcImage({
  unit = "patron",
  size,
  decorative = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof AssetImage>, "asset" | "loading" | "placeholderClassName"> &
  VariantProps<typeof npcImageVariants> & {
    /** Which unit. */
    unit?: NpcUnit;
    /** The unit's name is printed beside the picture: an empty `alt` and no title. */
    decorative?: boolean;
  }) {
  const { file, name } = NPC_ART[unit];
  const look = cn(npcImageVariants({ size }), className);
  return (
    <AssetImage
      data-slot="npc-image"
      data-unit={unit}
      asset={{
        webp: `${NPCS}/${file}.webp`,
        png: `${NPCS}/${file}.png`,
        alt: decorative ? "" : name,
        title: decorative ? "" : name,
      }}
      {...props}
      placeholderClassName={look}
      className={look}
    />
  );
}
