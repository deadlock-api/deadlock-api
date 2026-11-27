import { cva, type VariantProps } from "class-variance-authority";
import { Info } from "lucide-react";
import { Slot } from "radix-ui";
import { type ReactNode, useRef } from "react";

import { HeadingLevel } from "~/components/ui/heading";
import { assignRef } from "~/components/ui/hooks/assign-ref";
import { parseCountable, useCountUp } from "~/components/ui/hooks/use-count-up";
import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

import { useStoryFit } from "./use-story-fit";
import { useStoryReveal } from "./use-story-reveal";

// A story is a long page told in chapters, one idea each: a punchy headline, one big number and a line that makes it
// relatable, with the details under it. The yearly recap is one. Chapters stack in a StoryDeck; from a wide container
// a StoryProgress beside them marks where the reader is.

/**
 * The column of chapters, with an optional `progress` (a StoryProgress) that sticks beside it from a 64rem container
 * and is left out below, where the chapters take the whole width.
 */
export function StoryDeck({
  progress,
  layout = "flow",
  ref,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** A StoryProgress: the chapters' index, beside them on a wide container. */
  progress?: ReactNode;
  /**
   * `flow` (default): chapters stack and scroll like a page. `deck`: one chapter per screen; each is a page tall
   * (`--page-height`), the page snaps to them one at a time and a longer chapter scrolls inside its card.
   */
  layout?: "flow" | "deck";
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  useStoryReveal(deckRef, layout === "deck");
  useStoryFit(deckRef, layout === "deck");
  return (
    <div
      ref={(node) => {
        deckRef.current = node;
        return assignRef(ref, node);
      }}
      data-slot="story-deck"
      data-layout={layout}
      className={cn("@container/deck min-w-0", layout === "deck" && "story-deck", className)}
      {...props}
    >
      <div
        className={cn(
          "grid min-w-0 items-start gap-6",
          layout === "flow" && progress != null && "@5xl/deck:grid-cols-[minmax(0,1fr)_12rem]",
        )}
      >
        <div data-slot="story-deck-chapters" className="flex min-w-0 flex-col gap-6">
          {children}
        </div>
        {progress != null && (
          <div
            data-slot="story-deck-progress"
            className={cn(
              "hidden",
              layout === "flow"
                ? "sticky top-4 @5xl/deck:block"
                : "fixed inset-e-3 top-1/2 z-10 -translate-y-1/2 @5xl/deck:block",
            )}
          >
            {progress}
          </div>
        )}
      </div>
    </div>
  );
}

const chapterVariants = cva(
  "@container/story relative isolate flex min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-xl border bg-card",
  {
    variants: {
      /** `cover` opens or closes the story: more room and a display-size title. */
      size: {
        default: "gap-6 px-5 py-8 @2xl/story:gap-8 @2xl/story:px-10 @2xl/story:py-12",
        cover: "gap-8 px-5 py-12 @2xl/story:gap-10 @2xl/story:px-12 @2xl/story:py-20",
      },
      align: { start: "", center: "items-center text-center" },
      /**
       * `scroll` (default): the chapter rises in as it scrolls into view, its blocks and tiles follow, its big number pops
       * and its bars grow (CSS scroll-driven, off under reduced motion; the server HTML is the end state). `none` for a
       * chapter that must stay put.
       */
      reveal: { scroll: "story-reveal", none: "" },
    },
    defaultVariants: { size: "default", align: "start", reveal: "scroll" },
  },
);

const chapterTitleVariants = cva("font-display leading-none font-bold tracking-wide text-balance uppercase", {
  variants: {
    size: {
      default: "text-4xl @2xl/story:text-5xl",
      cover: "text-5xl @2xl/story:text-7xl",
    },
  },
  defaultVariants: { size: "default" },
});

interface StoryChapterProps
  extends Omit<React.ComponentProps<"section">, "title">, VariantProps<typeof chapterVariants> {
  /** The headline: what this chapter says, in a few words. */
  title: ReactNode;
  /** A small line above the title: the chapter's subject ("Heroes"). */
  eyebrow?: ReactNode;
  /** The lead under the title: one or two sentences. */
  description?: ReactNode;
  /** `h1` for the chapter that opens a page and names it; the others are `h2` (`h3` under a page section). */
  as?: "h1" | "h2" | "h3";
  /**
   * A CSS color that identifies the subject (a hero's color), glowing from the top edge. Defaults to the brand color;
   * it tints the surface only, never text.
   */
  accent?: string;
}

/** One chapter of a story: a full-width surface with its headline, lead and whatever tells it (children). */
export function StoryChapter({
  title,
  eyebrow,
  description,
  as: Title = "h2",
  accent = "var(--primary)",
  size,
  align,
  reveal,
  className,
  style,
  children,
  ...props
}: StoryChapterProps) {
  const level = Title === "h1" ? 1 : Title === "h2" ? 2 : 3;
  return (
    <section
      data-slot="story-chapter"
      data-size={size ?? "default"}
      className={cn(chapterVariants({ size, align, reveal }), className)}
      style={{ "--story-accent": accent, ...style } as React.CSSProperties}
      {...props}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-(--story-accent)/70" />
      <div
        aria-hidden="true"
        data-slot="story-chapter-glow"
        className="pointer-events-none absolute inset-x-0 -top-1/3 -z-10 h-2/3 bg-radial from-(--story-accent)/20 to-transparent to-70%"
      />
      <header
        data-slot="story-chapter-header"
        className={cn("flex min-w-0 flex-col gap-3", align === "center" && "items-center")}
      >
        {eyebrow != null && (
          <div data-slot="story-chapter-eyebrow" className="eyebrow">
            {eyebrow}
          </div>
        )}
        <Title className={chapterTitleVariants({ size })}>{title}</Title>
        {description != null && <p className="max-w-2xl type-prose text-pretty text-muted-foreground">{description}</p>}
      </header>
      <HeadingLevel level={level}>{children}</HeadingLevel>
    </section>
  );
}

const figureValueVariants = cva("font-display leading-none font-bold tabular-nums", {
  variants: {
    size: { sm: "type-figure-sm", default: "type-figure", lg: "type-figure-lg" },
    tone: {
      default: "text-foreground",
      primary: "text-primary",
      positive: "text-positive",
      negative: "text-negative",
      warning: "text-warning",
    },
  },
  defaultVariants: { size: "default", tone: "default" },
});

interface StoryFigureProps
  extends Omit<React.ComponentProps<"p">, "children">, VariantProps<typeof figureValueVariants> {
  /** `center` inside a centred chapter. */
  align?: "start" | "center";
  /** The number, already formatted ("2,842"). */
  value: ReactNode;
  /** What the number counts, after it on its baseline ("matches"). */
  unit?: ReactNode;
  /** A line under the number: the relatable comparison or its context. */
  caption?: ReactNode;
  /**
   * Count a text `value` that is one number ("2,842", "51.1%") up from zero the first time it scrolls into view. Off
   * under reduced motion and for a figure already on screen at load; assistive technology always reads the value.
   */
  countUp?: boolean;
}

/**
 * The one big number of a chapter, set in condensed capitals that scale with the chapter's width. A tone repeats what
 * the unit or caption says (a win rate over 50%); it is never the only signal.
 */
export function StoryFigure({
  value,
  unit,
  caption,
  size,
  tone,
  align = "start",
  countUp = true,
  className,
  ...props
}: StoryFigureProps) {
  const countable = countUp && typeof value === "string" && parseCountable(value) != null ? value : null;
  const counterRef = useRef<HTMLSpanElement>(null);
  const counted = useCountUp(counterRef, countable);
  return (
    <p
      data-slot="story-figure"
      data-align={align}
      className={cn("flex min-w-0 flex-col gap-2", align === "center" && "items-center text-center", className)}
      {...props}
    >
      <span
        className={cn("flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1", align === "center" && "justify-center")}
      >
        <span data-slot="story-figure-value" className={figureValueVariants({ size, tone })}>
          {countable == null ? (
            value
          ) : (
            <>
              <span ref={counterRef} aria-hidden="true">
                {counted}
              </span>
              <span className="sr-only">{countable}</span>
            </>
          )}
        </span>
        {unit != null && <span className="type-heading text-muted-foreground">{unit}</span>}
      </span>
      {caption != null && <span className="type-prose text-pretty text-foreground">{caption}</span>}
    </p>
  );
}

/**
 * A small honest note about the numbers around it: how many matches they cover, what is missing. Not hint text:
 * it qualifies data the chapter shows.
 */
export function StoryNote({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="story-note"
      className={cn("flex max-w-2xl items-start gap-2 type-caption text-muted-foreground", className)}
      {...props}
    >
      <Info aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The index of a story's chapters: a list of links, the one the reader is at marked current. */
export function StoryProgress({
  label = "Chapters",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"nav">, "aria-label"> & {
  /** The nav's accessible name. */
  label?: string;
}) {
  return (
    <nav data-slot="story-progress" aria-label={label} className={cn("min-w-0", className)} {...props}>
      <ol className="flex flex-col gap-0.5">{children}</ol>
    </nav>
  );
}

/**
 * One chapter in a StoryProgress: a link to its anchor (or, with `asChild`, a router link). `current` marks the chapter
 * in view with a long brand-red bar and full ink, announced as the current location.
 */
export function StoryProgressItem({
  current = false,
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"a"> & { current?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <li className="min-w-0">
      <Comp
        data-slot="story-progress-item"
        data-state={current ? "current" : "idle"}
        aria-current={current ? "location" : undefined}
        className={cn(
          FOCUS_RING,
          "group/story-item flex min-h-6 min-w-0 items-center gap-2 rounded-md px-2 py-1 type-caption text-muted-foreground transition-colors duration-fast hover:text-foreground data-[state=current]:font-semibold data-[state=current]:text-foreground",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className="h-0.5 w-3 shrink-0 rounded-full bg-border transition-all duration-normal group-hover/story-item:bg-muted-foreground group-data-[state=current]/story-item:w-6 group-data-[state=current]/story-item:bg-primary"
        />
        <span className="min-w-0 truncate">{children}</span>
      </Comp>
    </li>
  );
}
