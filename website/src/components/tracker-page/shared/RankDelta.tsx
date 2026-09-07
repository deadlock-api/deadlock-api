import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "./colors";

/** A signed rank change colored by direction; renders nothing for zero or unknown values. */
export function RankDelta({
  value,
  className,
  title,
}: {
  value: number | null | undefined;
  className?: string;
  title?: string;
}) {
  if (value == null || value === 0) return null;
  return (
    <span className={cn("tabular-nums", value > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS, className)} title={title}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}
