import type { FormResult } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import { LOSS_DOT_CLASS, WIN_DOT_CLASS } from "./colors";
import { PanelTooltip, TooltipHeader, TooltipStat, TooltipStats } from "./PanelTooltipContent";

export function FormDots({ form, className }: { form: FormResult[]; className?: string }) {
  if (form.length === 0) return null;
  const wins = form.filter((result) => result === "win").length;
  const summary = `Last ${form.length}: ${wins} wins, ${form.length - wins} losses, newest first`;
  return (
    <PanelTooltip
      content={
        <>
          <TooltipHeader title={`Last ${form.length} matches`} subtitle="Newest first" />
          <TooltipStats>
            <TooltipStat label="Wins" value={wins} />
            <TooltipStat label="Losses" value={form.length - wins} />
          </TooltipStats>
        </>
      }
    >
      <div className={cn("flex items-center gap-1", className)}>
        <span className="sr-only">
          {summary}. {form.map((result) => (result === "win" ? "Win" : "Loss")).join(", ")}.
        </span>
        {form.map((result, i) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key
            key={i}
            aria-hidden="true"
            className={cn("h-3 w-1.5 rounded-full", result === "win" ? WIN_DOT_CLASS : LOSS_DOT_CLASS)}
          />
        ))}
      </div>
    </PanelTooltip>
  );
}
