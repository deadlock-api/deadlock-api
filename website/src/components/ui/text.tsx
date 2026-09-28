import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const textVariants = cva("min-w-0", {
  variants: {
    /** A step of the named type scale: size, line height, weight and tracking together. */
    variant: {
      label: "type-label",
      body: "type-body",
      caption: "type-caption",
      meta: "type-meta",
      eyebrow: "eyebrow",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      positive: "text-positive",
      negative: "text-negative",
      warning: "text-warning",
      destructive: "text-destructive",
      inherit: "",
    },
    align: { start: "text-start", center: "text-center", end: "text-end" },
    /** `clamp-2`: up to two lines, then an ellipsis, for a name that should rarely be cut but must not grow a row. */
    wrap: { wrap: "", truncate: "truncate", "clamp-2": "line-clamp-2 break-words" },
    numeric: { proportional: "", tabular: "tabular-nums" },
  },
  defaultVariants: { variant: "body", tone: "inherit", align: "start", wrap: "wrap", numeric: "proportional" },
});

type TextElement = "span" | "p" | "div" | "strong";

interface TextProps extends Omit<React.ComponentProps<"span">, "color">, VariantProps<typeof textVariants> {
  as?: TextElement;
}

/**
 * Text set in a step of the type scale. A heading that belongs in the document outline is a Heading (or the title
 * of a PageHeader, Section, PanelHeader or Card); everything else that is text is this.
 */
export function Text({ as = "span", variant, tone, align, wrap, numeric, className, ...props }: TextProps) {
  const Comp = as as "span";
  return (
    <Comp
      data-slot="text"
      className={cn(textVariants({ variant, tone, align, wrap, numeric }), className)}
      {...props}
    />
  );
}
