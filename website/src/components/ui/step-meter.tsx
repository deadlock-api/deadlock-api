import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, XIcon } from "lucide-react";
import { createContext, use } from "react";

import { cn } from "~/lib/utils";

export type StepState = "done" | "current" | "correct" | "wrong" | "empty";
type StepMeterVariant = NonNullable<VariantProps<typeof stepMeterVariants>["variant"]>;

const stepMeterVariants = cva("items-center", {
  variants: {
    variant: {
      dots: "inline-flex gap-1",
      squares: "inline-flex gap-1",
      /** Segments that share the width of the container. */
      track: "flex w-full gap-1",
    },
  },
  defaultVariants: { variant: "dots" },
});

const STEP_SHAPE: Record<StepMeterVariant, string> = {
  dots: "size-3.5 rounded-full border",
  squares: "size-3.5 rounded-xs border",
  track: "h-1.5 flex-1 rounded-full border",
};

// Correct and wrong never differ by color alone: a mark carries a check or a cross, a track segment is full or thin.
const STEP_STATE: Record<StepState, string> = {
  done: "border-primary bg-primary",
  current: "animate-pulse border-primary motion-reduce:animate-none",
  correct: "border-positive bg-positive text-background",
  wrong: "border-negative bg-negative text-background",
  empty: "border-muted-foreground/40",
};

const StepMeterVariantContext = createContext<StepMeterVariant>("dots");

/** Steps `0..value-1` done, step `value` current, the rest empty: the states of a plain "3 of 10" progress. */
export function progressSteps(value: number, max: number): StepState[] {
  return Array.from({ length: max }, (_, index) => (index < value ? "done" : index === value ? "current" : "empty"));
}

/**
 * A few discrete steps and the state of each: attempts of a quiz, questions of a round, stages of a flow. The
 * children are `StepMeterStep`s; the meter is one image whose name is `aria-label`.
 */
function StepMeter({
  variant = "dots",
  className,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof stepMeterVariants> & {
    /** Read out in place of the marks: "2 of 6 attempts used". */
    "aria-label": string;
  }) {
  const resolved = variant ?? "dots";
  return (
    <StepMeterVariantContext value={resolved}>
      <span
        data-slot="step-meter"
        data-variant={resolved}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the marks are drawn with CSS; there is no image file
        role="img"
        className={cn(stepMeterVariants({ variant }), className)}
        {...props}
      />
    </StepMeterVariantContext>
  );
}

function StepMeterStep({
  state = "empty",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { state?: StepState }) {
  const variant = use(StepMeterVariantContext);
  const Glyph = state === "correct" ? CheckIcon : state === "wrong" ? XIcon : null;
  return (
    <span
      data-slot="step-meter-step"
      data-state={state}
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-colors",
        STEP_SHAPE[variant],
        STEP_STATE[state],
        variant === "track" && state === "wrong" && "h-0.5",
        className,
      )}
      {...props}
    >
      {Glyph && variant !== "track" && <Glyph aria-hidden="true" className="size-2.5 stroke-3" />}
    </span>
  );
}

export { StepMeter, StepMeterStep };
