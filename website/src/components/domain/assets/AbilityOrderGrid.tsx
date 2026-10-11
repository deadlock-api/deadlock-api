import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { FOCUS_RING } from "~/components/ui/recipes";
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
 *
 * With `onValueChange` it is an editor: every cell is a button that makes that upgrade that row's ability (pressed where
 * it already is), and `maxPerAbility` disables the cells that would give an ability more points than it can take.
 */
export function AbilityOrderGrid({
  abilityIds,
  steps,
  formatRate = formatPercent,
  onValueChange,
  abilityNames,
  maxPerAbility = 4,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** Makes the grid an editor of the order: called with the order after a cell press, ability ids by upgrade. */
  /** The abilities' names in slot order, for the editor's cell labels ("Upgrade 3: Fixation"). */
  abilityNames?: readonly string[];
  onValueChange?: (abilityIds: number[]) => void;
  /** The most points an ability takes (its unlock and three upgrades), for the editor. */
  maxPerAbility?: number;
  /** The hero's abilities in slot order: the rows. */
  abilityIds: readonly number[];
  steps: readonly AbilityOrderStep[];
  /** Prints a step's pick rate in the last row. */
  formatRate?: (rate: number) => string;
}) {
  const hasRates = steps.some((step) => step.pickRate !== undefined);
  const editable = onValueChange !== undefined;
  const pointsOf = (abilityId: number) => steps.filter((step) => step.abilityId === abilityId).length;
  return (
    <div
      data-slot="ability-order-grid"
      className={cn("@container min-w-0", editable && "overflow-x-auto pb-1", className)}
      {...props}
    >
      <ol className={editable ? "hidden" : "sr-only"}>
        {steps.map((step, index) => (
          <li key={index}>
            <AbilityName abilityId={step.abilityId} />
            {step.pickRate !== undefined && `, taken by ${formatRate(step.pickRate)}`}
          </li>
        ))}
      </ol>
      <div
        aria-hidden={editable ? undefined : true}
        role={editable ? "group" : undefined}
        aria-label={editable ? "Skill order" : undefined}
        className="grid items-center justify-start gap-1 @md:gap-1.5"
        // An editor's cells keep a 24px target (Law 18) and the grid scrolls sideways where they do not fit.
        style={{ gridTemplateColumns: `auto repeat(${steps.length}, minmax(${editable ? "1.5rem" : "0"}, 2.5rem))` }}
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
            {steps.map((step, index) => {
              const taken = step.abilityId === abilityId;
              const cell = cn(
                "flex aspect-square items-center justify-center rounded-md border type-caption font-semibold tabular-nums",
                taken ? cn("text-foreground", SLOT_CELL[slot % SLOT_CELL.length]) : "border-hairline bg-subtle",
              );
              if (!editable) {
                return (
                  <div key={index} className={cell}>
                    {taken ? index + 1 : null}
                  </div>
                );
              }
              return (
                // ds-allow raw-button: a cell of the bespoke skill-order grid, its look the cell's own
                <button
                  key={index}
                  type="button"
                  aria-pressed={taken}
                  aria-label={`Upgrade ${index + 1}: ${abilityNames?.[slot] ?? `ability ${slot + 1}`}`}
                  disabled={!taken && pointsOf(abilityId) >= maxPerAbility}
                  onClick={() => onValueChange(steps.map((s, i) => (i === index ? abilityId : s.abilityId)))}
                  className={cn(
                    cell,
                    FOCUS_RING,
                    "cursor-pointer transition-colors duration-fast ease-standard hover:border-muted-foreground disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:hover:border-hairline",
                  )}
                >
                  {taken ? index + 1 : null}
                </button>
              );
            })}
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
