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
  align = "end",
}: {
  player: ComparedPlayer;
  /** `start`: the name from the column's start edge, where it has the column's width to itself before it truncates. */
  align?: "start" | "end";
  /** The column's values are `RowValue`s, which keep a crown's slot after them: the name keeps one too. */
  crownSlot?: boolean;
}) {
  return (
    <TableHead className={align === "end" ? "text-end" : undefined}>
      <Inline gap={1} wrap="nowrap" justify={align}>
        <StatusDot color={player.color} />
        {player.profileLoading ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <span
            className={cn(
              "max-w-14 truncate",
              align === "end" ? "@md/table:max-w-24 @2xl/table:max-w-none" : "@md/table:max-w-none",
            )}
            title={player.name}
          >
            {player.name}
          </span>
        )}
        {/* The crown's slot every value keeps (RowValue), so the name ends where the values do. */}
        {crownSlot && <span aria-hidden="true" className="hidden size-3.5 shrink-0 @xl/table:block" />}
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
  /**
   * `fixed`: the value in a box of one width from a 36rem table (`fixed-wide`: from 42rem, for four or five players), so
   * something before it (a hero) lines up down the column too.
   */
  width?: "auto" | "fixed" | "fixed-wide";
  children: React.ReactNode;
}) {
  return (
    <Inline gap={1} wrap="nowrap" justify="end">
      <Text
        tone={won ? "default" : "muted"}
        className={cn(
          won && "font-semibold",
          width !== "auto" && "shrink-0 text-end whitespace-nowrap",
          width === "fixed" && "@xl/table:w-16",
          width === "fixed-wide" && "@2xl/table:w-16",
        )}
      >
        {children}
      </Text>
      {won ? (
        <CrownIcon aria-hidden="true" className="hidden size-3.5 shrink-0 @xl/table:block" />
      ) : (
        <span aria-hidden="true" className="hidden size-3.5 shrink-0 @xl/table:block" />
      )}
      {won && <span className="sr-only">, best</span>}
    </Inline>
  );
}
