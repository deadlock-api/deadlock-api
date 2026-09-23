import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLMotionProps, motion } from "framer-motion";
import { Check, X } from "lucide-react";

import { Kbd } from "~/components/ui/kbd";
import { FOCUS_RING_BORDER } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const answerOptionVariants = cva(
  [
    FOCUS_RING_BORDER,
    "cursor-target flex items-center border font-mono transition-colors duration-fast disabled:cursor-default",
  ],
  {
    variants: {
      state: {
        idle: "border-border bg-card/60 text-foreground enabled:hover:border-primary/50 enabled:hover:bg-primary/5 enabled:hover:text-primary",
        selected: "border-primary/60 bg-primary/15 text-primary",
        correct: "border-positive/60 bg-positive/10 text-positive",
        wrong: "border-negative/60 bg-negative/10 text-negative",
        dimmed: "border-border/50 bg-card/40 text-muted-foreground",
      },
      variant: {
        /** A full-width answer with a trailing result mark. */
        row: "w-full justify-between gap-3 px-4 py-3 text-start text-sm font-medium",
        /** One of a few short choices sharing a line. */
        tile: "flex-1 justify-center px-2 py-2.5 text-center text-xs font-semibold",
      },
      /** The category an answer belongs to, for a quiz whose choices are item categories. */
      tone: {
        none: "",
        "item-weapon":
          "data-[state=selected]:border-item-weapon/60 data-[state=selected]:bg-item-weapon/15 data-[state=selected]:text-item-weapon",
        "item-vitality":
          "data-[state=selected]:border-item-vitality/60 data-[state=selected]:bg-item-vitality/15 data-[state=selected]:text-item-vitality",
        "item-spirit":
          "data-[state=selected]:border-item-spirit/60 data-[state=selected]:bg-item-spirit/15 data-[state=selected]:text-item-spirit",
      },
    },
    defaultVariants: { state: "idle", variant: "row", tone: "none" },
  },
);

export type AnswerOptionState = NonNullable<VariantProps<typeof answerOptionVariants>["state"]>;

/** The state of one option once the answer is known: the right one is marked, a wrong pick is flagged, the rest fade. */
export function revealedState(correct: boolean, picked: boolean): AnswerOptionState {
  if (correct) return "correct";
  return picked ? "wrong" : "dimmed";
}

interface AnswerOptionProps
  extends Omit<HTMLMotionProps<"button">, "children">, VariantProps<typeof answerOptionVariants> {
  children: React.ReactNode;
  /**
   * The key that picks this answer, e.g. "1": drawn as a keycap in front of the text on devices with a fine pointer
   * (a touch screen has no number row), and announced through `aria-keyshortcuts` rather than read as part of the name.
   * The game listens for the key itself.
   */
  shortcut?: string;
}

/** One answer of a quiz, in every game. The result is carried by a mark as well as by color. */
export function AnswerOption({
  state = "idle",
  variant = "row",
  tone = "none",
  className,
  children,
  disabled,
  shortcut,
  ...props
}: AnswerOptionProps) {
  return (
    // ds-allow raw-button: quiz answer tile, a bespoke hit area whose content ranges from a name to an item card
    <motion.button
      type="button"
      data-slot="answer-option"
      data-state={state}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97, transition: { duration: 0 } }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={cn(answerOptionVariants({ state, variant, tone }), className)}
      aria-keyshortcuts={shortcut}
      {...props}
    >
      {shortcut ? (
        <span className="flex min-w-0 items-center gap-3">
          <Kbd aria-hidden="true" className="hidden pointer-fine:inline-flex">
            {shortcut}
          </Kbd>
          {children}
        </span>
      ) : (
        children
      )}
      {variant === "row" && state === "correct" && <Check aria-label="Correct" className="size-4 shrink-0" />}
      {variant === "row" && state === "wrong" && <X aria-label="Wrong" className="size-4 shrink-0" />}
    </motion.button>
  );
}
