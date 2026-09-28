import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLMotionProps, motion } from "framer-motion";
import { Check, X } from "lucide-react";

import { Kbd } from "~/components/ui/kbd";
import { FOCUS_RING_BORDER } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const answerOptionVariants = cva(
  [
    FOCUS_RING_BORDER,
    "cursor-target flex items-center border font-mono transition-colors duration-fast disabled:cursor-default aria-disabled:cursor-default",
    // Icons in the label keep their size when a long label wraps.
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      state: {
        idle: "border-border bg-card/60 text-foreground enabled:not-aria-disabled:hover:border-primary/50 enabled:not-aria-disabled:hover:bg-primary/5 enabled:not-aria-disabled:hover:text-primary",
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
        /** One of two or three big choices sharing a line, the main action of a round, with a result mark. */
        choice: "min-h-11 min-w-0 flex-1 justify-center gap-2 px-3 py-3 text-center text-sm font-semibold text-balance",
        /**
         * A 44px square holding only an icon (Higher / Lower around a `VersusValue` in `VersusActions`). It needs an
         * `aria-label`, draws no keycap, and after the reveal the icon gives way to the result mark.
         */
        icon: "size-11 shrink-0 justify-center [&_svg]:size-5",
        /**
         * A whole card is the answer (a contender of `VersusChoice`): the children lay themselves out in a column, the
         * keycap and the result mark sit in the top corners over the padding, so neither moves the content.
         */
        card: "relative min-h-11 w-full min-w-0 flex-col items-center justify-start gap-3 px-2 py-3 text-center",
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

type AnswerOptionVariant = NonNullable<VariantProps<typeof answerOptionVariants>["variant"]>;

interface AnswerOptionBaseProps
  extends Omit<HTMLMotionProps<"button">, "children">, Omit<VariantProps<typeof answerOptionVariants>, "variant"> {
  children: React.ReactNode;
  /**
   * The key that picks this answer, e.g. "1": drawn as a keycap in front of the text on devices with a fine pointer
   * (a touch screen has no number row), and announced through `aria-keyshortcuts` rather than read as part of the name.
   * The game listens for the key itself.
   */
  shortcut?: string;
}

/** An icon-only answer has no text to be named by, so it takes its name from `aria-label`. */
type AnswerOptionProps = AnswerOptionBaseProps &
  ({ variant?: Exclude<AnswerOptionVariant, "icon"> } | { variant: "icon"; "aria-label": string });

/**
 * One answer of a quiz, in every game. The result is carried by a mark as well as by color. `row` and `choice` keep the
 * mark's slot in every state, empty until the reveal, so revealing an answer never changes its width, height or wrap.
 *
 * While an answer is revealed the options take `aria-disabled` rather than `disabled`: they stay focusable, so focus
 * stays on the answer just picked instead of falling to <body>, and a click or Enter on them does nothing.
 */
export function AnswerOption({
  state = "idle",
  variant = "row",
  tone = "none",
  className,
  children,
  disabled,
  shortcut,
  onClick,
  ...props
}: AnswerOptionProps) {
  const locked = disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return (
    // ds-allow raw-button: quiz answer tile, a bespoke hit area whose content ranges from a name to an item card
    <motion.button
      type="button"
      data-slot="answer-option"
      data-state={state}
      disabled={disabled}
      whileTap={locked ? undefined : { scale: 0.97, transition: { duration: 0 } }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={cn(answerOptionVariants({ state, variant, tone }), className)}
      aria-keyshortcuts={shortcut}
      onClick={locked ? undefined : onClick}
      {...props}
    >
      {variant === "icon" ? (
        state === "correct" || state === "wrong" ? (
          <ResultMark state={state} />
        ) : (
          children
        )
      ) : variant === "card" ? (
        <>
          {shortcut && (
            <Kbd aria-hidden="true" className="absolute inset-s-2 top-2 hidden pointer-fine:inline-flex">
              {shortcut}
            </Kbd>
          )}
          {children}
          <ResultMark state={state ?? "idle"} className="absolute inset-e-2 top-2" />
        </>
      ) : (
        <>
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
          {variant !== "tile" && <ResultMark state={state ?? "idle"} />}
        </>
      )}
    </motion.button>
  );
}

/** The result mark, or an empty slot of the same size before the reveal. */
function ResultMark({ state, className }: { state: AnswerOptionState; className?: string }) {
  const mark = cn("size-4 shrink-0", className);
  if (state === "correct") return <Check data-slot="answer-option-mark" aria-label="Correct" className={mark} />;
  if (state === "wrong") return <X data-slot="answer-option-mark" aria-label="Wrong" className={mark} />;
  return <span data-slot="answer-option-mark" aria-hidden="true" className={mark} />;
}
