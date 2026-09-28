import { cva } from "class-variance-authority";
import { animate, type HTMLMotionProps, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { createContext, use, useEffect } from "react";

import { AnswerOption } from "~/components/domain/minigames/AnswerOption";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";

/**
 * Two contenders side by side, for a game that compares them: `VersusSide`, `VersusDivider`, `VersusSide`. It stays
 * one row down to 320px; the art and the value shrink with the board's own width, not the viewport's. When both values
 * belong to someone else (a hero's win rate against two enemies), a `VersusSubject` comes first and spans the board.
 *
 * The sides share the board's rows (CSS subgrid): art, name, and value (or `VersusActions`, the value between its
 * answers). So the two values line up even when one name wraps to two lines and the other does not. Place it in a
 * non-wrapping column (`Stack`):
 * Chrome under-measures a subgrid's height inside a wrapping flex column, and the board overlaps what follows.
 */
function Versus({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="versus"
      className={cn(
        "group/versus @container/versus grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-3",
        className,
      )}
      {...props}
    />
  );
}

/** The rows a side spans on the board: art, name, value. */
const SIDE_ROWS = "grid grid-cols-1 grid-rows-subgrid row-span-3 justify-items-center gap-3";

/**
 * Whose numbers the two sides are: `VersusArt`, `VersusName` and a line saying what is measured. It spans the board
 * above the sides; pair it with `<VersusDivider>OR</VersusDivider>`, since the sides are alternatives, not opponents.
 */
function VersusSubject({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Card
      data-slot="versus-subject"
      tone="primary"
      size="sm"
      className={cn("col-span-3 flex-row items-center justify-center gap-3 px-3", className)}
      {...props}
    />
  );
}

type VersusEmphasis = "none" | "target";
type VersusOutcome = "none" | "higher" | "lower";

/** The side's outcome, read by its `VersusValue` to set the value's contrast. */
const VersusOutcomeContext = createContext<VersusOutcome>("none");

interface VersusSideProps extends React.ComponentProps<"div"> {
  /** `target`: the side the player is judging, drawn in the primary tone like `VersusSubject`. */
  emphasis?: VersusEmphasis;
  /**
   * After the reveal: `higher` keeps the value at full contrast and puts an up arrow in the card's corner (and the word
   * "higher" for screen readers), `lower` mutes the value. Once set it wins over `emphasis`, which then drops its tint.
   * The arrow is laid over the corner, so a side's size never changes on reveal.
   */
  outcome?: VersusOutcome;
}

/** One contender: `VersusArt`, `VersusName`, then `VersusValue`. */
function VersusSide({ emphasis = "none", outcome = "none", className, children, ...props }: VersusSideProps) {
  return (
    <Card
      data-slot="versus-side"
      data-emphasis={emphasis}
      data-outcome={outcome}
      size="sm"
      tone={outcome === "none" && emphasis === "target" ? "primary" : "card"}
      className={cn(SIDE_ROWS, "relative px-2 text-center @max-2xs/versus:px-1 @md/versus:px-4", className)}
      {...props}
    >
      <VersusOutcomeContext value={outcome}>{children}</VersusOutcomeContext>
      {outcome === "higher" && (
        <span data-slot="versus-outcome" className="absolute inset-e-2 top-2 text-foreground">
          <ArrowUp aria-hidden="true" className="size-4" />
          <span className="sr-only">Higher</span>
        </span>
      )}
      {outcome === "lower" && (
        <span data-slot="versus-outcome" className="sr-only">
          Lower
        </span>
      )}
    </Card>
  );
}

/**
 * A side the player picks by clicking it: the whole card is one button (`AnswerOption variant="card"`), for a round
 * that asks which of two contenders wins. It takes AnswerOption's `state` (idle, then `revealedState()` after the
 * answer), `shortcut` (a keycap in the top-start corner on fine pointers, plus `aria-keyshortcuts`) and `aria-disabled`
 * while revealed, so focus stays on the pick. The ✓ / ✗ mark appears in the top-end corner, over the padding, so the
 * card never changes size. Children are the same parts as a `VersusSide`.
 */
function VersusChoice({ className, ...props }: Omit<React.ComponentProps<typeof AnswerOption>, "variant" | "tone">) {
  return (
    <AnswerOption
      data-slot="versus-choice"
      variant="card"
      className={cn(SIDE_ROWS, "items-stretch font-sans @max-2xs/versus:px-1 @md/versus:px-4", className)}
      {...props}
    />
  );
}

/**
 * The judged value between its answers, in the value's row: `AnswerOption variant="icon"` (Lower), the side's
 * `VersusValue`, `AnswerOption variant="icon"` (Higher). One line once the board is 32rem wide; narrower, a side has no
 * room for both squares beside the value, so the value goes on top and the answers share the line under it. Keep the
 * answers after the reveal with their result states; their size never changes, so nothing moves.
 */
function VersusActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="versus-actions"
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-1",
        "*:data-[slot=versus-value]:order-first *:data-[slot=versus-value]:basis-full",
        "*:data-[slot=answer-option]:w-auto *:data-[slot=answer-option]:max-w-20 *:data-[slot=answer-option]:flex-1",
        "@lg/versus:flex-nowrap @lg/versus:gap-3 @lg/versus:*:data-[slot=answer-option]:w-11 @lg/versus:*:data-[slot=answer-option]:flex-none @lg/versus:*:data-[slot=versus-value]:order-none @lg/versus:*:data-[slot=versus-value]:basis-auto",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The contender's picture: a hero, an ability, an icon. Decorative, since `VersusName` names it. The box shrinks with
 * the board (`@container/versus`): 2.5rem on the narrowest board, 3rem from 18rem, 3.5rem from 24rem, 5rem from 28rem.
 * Its child sizes itself to the box with `versusArtImageVariants({ fit })`.
 */
function VersusArt({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="versus-art"
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center @2xs/versus:size-12 @sm/versus:size-14 @md/versus:size-20",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The class for the image inside `VersusArt`. `fill`: a portrait or ability art fills the box. `icon`: a glyph at three
 * quarters of the box, letterboxed (`object-contain`). It goes on the image itself rather than on `VersusArt` as a
 * child selector: the image components carry a default size of their own, which their `cn()` replaces with this one,
 * while a parent's `*:size-full` would only win by Tailwind's ordering of variants.
 */
const versusArtImageVariants = cva("", {
  variants: {
    fit: {
      fill: "size-full object-cover",
      icon: "size-3/4 object-contain",
    },
  },
  defaultVariants: { fit: "fill" },
});

function VersusName({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="versus-name" className={cn("type-label text-balance", className)} {...props} />;
}

/** Seconds a revealed value takes to count up. */
const COUNT_UP_SECONDS = 0.6;

interface VersusValueProps extends React.ComponentProps<"p"> {
  /**
   * `shown`: the value is known from the start. `hidden`: a muted `placeholder` stands in for it until the round is
   * answered. `revealed`: the value just came in and pops in (a fade only when the user asks for reduced motion).
   */
  state?: "shown" | "hidden" | "revealed";
  /** What stands in for a hidden value. Screen readers hear "Hidden" instead. */
  placeholder?: React.ReactNode;
  /**
   * Counts a revealed value up from `from` (0) to `value` over 0.6s, each frame drawn by `format`, which should give
   * the same text as `children` for `value`. Under reduced motion the final value shows at once.
   */
  countTo?: { value: number; format: (value: number) => string; from?: number };
}

/**
 * The number being compared. `children` is the formatted value in every state: it is also laid out invisibly under
 * the placeholder and the counting number, so the value's box already has its final size while hidden and neither
 * the reveal nor the count-up moves anything.
 */
function VersusValue({ state = "shown", placeholder = "?", countTo, className, children, ...props }: VersusValueProps) {
  const outcome = use(VersusOutcomeContext);
  const muted = state !== "hidden" && outcome === "lower";
  return (
    <p
      data-slot="versus-value"
      data-state={state}
      className={cn(
        "relative grid justify-items-center font-mono type-value-lg tabular-nums",
        muted && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {children}
      </span>
      {state === "hidden" ? (
        <>
          <span aria-hidden="true" className="col-start-1 row-start-1 text-muted-foreground">
            {placeholder}
          </span>
          <span className="sr-only">Hidden</span>
        </>
      ) : state === "revealed" ? (
        <motion.span
          className="col-start-1 row-start-1 inline-block"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 18 }}
        >
          {countTo ? (
            <>
              <CountUp aria-hidden="true" {...countTo} />
              <span className="sr-only">{children}</span>
            </>
          ) : (
            children
          )}
        </motion.span>
      ) : (
        <span className="col-start-1 row-start-1">{children}</span>
      )}
    </p>
  );
}

interface CountUpProps extends Omit<HTMLMotionProps<"span">, "children"> {
  value: number;
  format: (value: number) => string;
  from?: number;
}

/**
 * A number counting up to `value`. It renders `format(value)` first, so the server and the first client render agree,
 * then restarts from `from` in an effect; framer writes each frame to the text node without re-rendering.
 */
function CountUp({ value, format, from = 0, ...props }: CountUpProps) {
  const reducedMotion = useReducedMotion();
  const current = useMotionValue(value);
  const text = useTransform(current, (n) => format(n));
  useEffect(() => {
    if (reducedMotion) {
      current.jump(value);
      return;
    }
    current.jump(from);
    const controls = animate(current, value, { duration: COUNT_UP_SECONDS, ease: "easeOut" });
    return () => controls.stop();
  }, [current, value, from, reducedMotion]);
  return <motion.span {...props}>{text}</motion.span>;
}

/** The "VS" between the sides. */
function VersusDivider({ className, children = "VS", ...props }: React.ComponentProps<typeof TerminalBadge>) {
  return (
    <TerminalBadge
      data-slot="versus-divider"
      variant="outline"
      size="sm"
      className={cn("row-span-3", className)}
      {...props}
    >
      {children}
    </TerminalBadge>
  );
}

export {
  Versus,
  VersusSubject,
  VersusSide,
  VersusChoice,
  VersusActions,
  VersusArt,
  versusArtImageVariants,
  VersusName,
  VersusValue,
  VersusDivider,
};
export type { VersusEmphasis, VersusOutcome };
