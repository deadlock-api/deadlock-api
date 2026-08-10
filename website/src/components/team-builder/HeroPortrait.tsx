import { HeroImage } from "~/components/HeroImage";
import type { Side } from "~/lib/team-builder/analysis";
import { cn } from "~/lib/utils";

const RING = {
  ally: "border-green-400/50",
  enemy: "border-primary/50",
} as const;

/**
 * The single hero portrait used across the whole Team Builder. Always round: the hero art is a
 * transparent PNG, so a square crop leaves visible corners against every surface it sits on.
 */
export function HeroPortrait({
  heroId,
  size = "size-7",
  side,
  className,
}: {
  heroId: number;
  size?: string;
  side?: Side;
  className?: string;
}) {
  return (
    <HeroImage
      heroId={heroId}
      className={cn("shrink-0 rounded-full object-cover", side && ["border", RING[side]], size, className)}
    />
  );
}
