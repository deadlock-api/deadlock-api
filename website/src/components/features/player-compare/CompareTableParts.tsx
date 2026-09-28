import { CrownIcon } from "lucide-react";

import { Skeleton } from "~/components/ui/skeleton";
import { Inline } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { TableHead } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

import type { ComparedPlayer } from "./types";

/** A player's column head in a compare table: their color and name, truncated only in a narrow table. */
export function PlayerColumnHead({
  player,
  crownSlot = true,
}: {
  player: ComparedPlayer;
  /** The column's values are `RowValue`s, which keep a crown's slot after them: the name keeps one too. */
  crownSlot?: boolean;
}) {
  return (
    <TableHead className="text-end">
      <Inline gap={1} wrap="nowrap" justify="end">
        <StatusDot color={player.color} />
        {player.profileLoading ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <span className="max-w-14 truncate @md/table:max-w-32 @xl/table:max-w-none" title={player.name}>
            {player.name}
          </span>
        )}
        {/* The crown's slot every value keeps (RowValue), so the name ends where the values do. */}
        {crownSlot && <span aria-hidden="true" className="hidden size-3.5 shrink-0 @md/table:block" />}
      </Inline>
    </TableHead>
  );
}

/**
 * One value in a compare table: the best of its row gets a crown and full ink, the rest are muted. No hue: every hue is
 * also some player's color. Every value keeps a crown's slot after it, filled or not, so the values end on one edge and
 * the crowns sit in one column beside them. A phone-narrow table keeps the bold ink and drops the slot, so more players
 * fit.
 */
export function RowValue({
  won,
  width = "auto",
  children,
}: {
  won: boolean;
  /** `fixed`: the value in a box of one width, so something before it (a hero) lines up down the column too. */
  width?: "auto" | "fixed";
  children: React.ReactNode;
}) {
  return (
    <Inline gap={1} wrap="nowrap" justify="end">
      <Text
        tone={won ? "default" : "muted"}
        className={cn(won && "font-semibold", width === "fixed" && "w-16 shrink-0 text-end whitespace-nowrap")}
      >
        {children}
      </Text>
      {won ? (
        <CrownIcon aria-hidden="true" className="hidden size-3.5 shrink-0 @md/table:block" />
      ) : (
        <span aria-hidden="true" className="hidden size-3.5 shrink-0 @md/table:block" />
      )}
      {won && <span className="sr-only">, best</span>}
    </Inline>
  );
}
