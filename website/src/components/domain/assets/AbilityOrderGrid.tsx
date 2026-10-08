import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { cn } from "~/lib/utils";

/** The colors of the four ability slots, the same in every skill-order view. */
const SLOT_CELL = [
  "border-chart-4/70 bg-chart-4/25",
  "border-chart-2/70 bg-chart-2/25",
  "border-chart-6/70 bg-chart-6/25",
  "border-chart-5/70 bg-chart-5/25",
] as const;

const formatPercent = (rate: number) => `${Math.round(rate * 100)}%`;

export interface AbilityOrderStep {
  abilityId: number;
  /** Share of the players at the previous step who took this upgrade next. */
  pickRate?: number;
}

/**
 * A skill order as the game guides draw it: one row per ability (in slot order), one column per upgrade, and a filled
 * cell with the upgrade's number where that ability was upgraded. With `pickRate` on the steps, a last row says how
 * many players took each one, where the container is wide enough (`@lg`) to print it. Screen readers get the order as a numbered list instead of the grid.
 */
export function AbilityOrderGrid({
  abilityIds,
  steps,
  formatRate = formatPercent,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** The hero's abilities in slot order: the rows. */
  abilityIds: readonly number[];
  steps: readonly AbilityOrderStep[];
  /** Prints a step's pick rate in the last row. */
  formatRate?: (rate: number) => string;
}) {
  const hasRates = steps.some((step) => step.pickRate !== undefined);
  return (
    <div data-slot="ability-order-grid" className={cn("@container min-w-0", className)} {...props}>
      <ol className="sr-only">
        {steps.map((step, index) => (
          <li key={index}>
            <AbilityName abilityId={step.abilityId} />
            {step.pickRate !== undefined && `, taken by ${formatRate(step.pickRate)}`}
          </li>
        ))}
      </ol>
      <div
        aria-hidden="true"
        className="grid items-center justify-start gap-1 @md:gap-1.5"
        style={{ gridTemplateColumns: `auto repeat(${steps.length}, minmax(0, 2.5rem))` }}
      >
        {abilityIds.map((abilityId, slot) => (
          <div key={abilityId} className="contents">
            <div className="flex min-w-0 items-center gap-2 pe-1 @3xl:pe-3">
              <AbilityImage abilityId={abilityId} className="size-6 shrink-0 @md:size-8" />
              <AbilityName
                abilityId={abilityId}
                className="hidden w-32 type-caption text-muted-foreground @3xl:block"
              />
            </div>
            {steps.map((step, index) => (
              <div
                key={index}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border type-caption font-semibold tabular-nums",
                  step.abilityId === abilityId
                    ? cn("text-foreground", SLOT_CELL[slot % SLOT_CELL.length])
                    : "border-hairline bg-subtle",
                )}
              >
                {step.abilityId === abilityId ? index + 1 : null}
              </div>
            ))}
          </div>
        ))}
        {hasRates && (
          <>
            <span className="hidden pe-1 type-caption text-muted-foreground @lg:inline">Took</span>
            {steps.map((step, index) => (
              <span
                key={index}
                className="hidden text-center type-caption text-muted-foreground tabular-nums @lg:inline"
              >
                {step.pickRate !== undefined ? formatRate(step.pickRate) : ""}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
