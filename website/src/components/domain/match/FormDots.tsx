import { PanelTooltip, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { TONE_BG } from "~/lib/tone";
import type { FormResult } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

/** A player's last few results, newest first, as win and loss ticks; tooltip and screen readers get the counts. */
export function FormDots({
  form,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { form: FormResult[] }) {
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
      <div data-slot="form-dots" className={cn("flex items-center gap-1", className)} {...props}>
        <span className="sr-only">
          {summary}. {form.map((result) => (result === "win" ? "Win" : "Loss")).join(", ")}.
        </span>
        {form.map((result, i) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key
            key={i}
            aria-hidden="true"
            // A loss is also shorter, so the run reads without the colors.
            className={cn(
              "w-1.5 rounded-full",
              result === "win" ? ["h-3", TONE_BG.positive] : ["h-1.5", TONE_BG.negative],
            )}
          />
        ))}
      </div>
    </PanelTooltip>
  );
}
