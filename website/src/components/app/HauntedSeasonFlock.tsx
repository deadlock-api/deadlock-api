import { useEffect, useState } from "react";

import { SeasonFlock, SeasonPuff } from "~/components/patterns/page/SeasonScene";
import { useIdle } from "~/hooks/useIdle";
import { useHalloween, useSeasonBrowserChrome } from "~/hooks/useSeason";

/** A minute without input while a season is on, and the page is haunted until the next one. */
const HAUNT_AFTER_MS = 60_000;
const PUFF_KINDS = ["bat", "ghost", "bat", "boo"] as const;
/** At most this many surprises in the air, so a burst of clicks stays a handful. */
const MAX_PUFFS = 8;

interface Puff {
  id: number;
  kind: (typeof PUFF_KINDS)[number];
  x: number;
  y: number;
}

/**
 * The root's `SeasonFlock` in a seasonal theme: haunted while the visitor is idle, and a surprise at every click. It
 * also dresses the browser tab for the season.
 */
export function HauntedSeasonFlock() {
  const inSeason = useHalloween();
  useSeasonBrowserChrome(inSeason);
  const haunted = useIdle(HAUNT_AFTER_MS, inSeason);
  const [puffs, setPuffs] = useState<Puff[]>([]);

  useEffect(() => {
    if (!inSeason) return;
    let next = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const kind = PUFF_KINDS[Math.floor(Math.random() * PUFF_KINDS.length)] ?? "bat";
      const puff = { id: next++, kind, x: event.clientX, y: event.clientY };
      setPuffs((current) => [...current, puff].slice(-MAX_PUFFS));
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [inSeason]);

  return (
    <SeasonFlock haunted={haunted}>
      {puffs.map((puff) => (
        <SeasonPuff
          key={puff.id}
          kind={puff.kind}
          x={puff.x}
          y={puff.y}
          onAnimationEnd={() => setPuffs((current) => current.filter((other) => other.id !== puff.id))}
        />
      ))}
    </SeasonFlock>
  );
}
