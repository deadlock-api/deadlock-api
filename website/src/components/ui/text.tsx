import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "~/lib/utils";

const textVariants = cva("min-w-0", {
  variants: {
    /** A step of the named type scale: size, line height, weight and tracking together. */
    variant: {
      display: "type-display",
      "title-lg": "type-title-lg",
      title: "type-title",
      heading: "type-heading",
      subheading: "type-subheading",
      label: "type-label",
      body: "type-body",
      prose: "type-prose",
      caption: "type-caption",
      meta: "type-meta",
      eyebrow: "eyebrow",
      value: "type-value",
      "value-lg": "type-value-lg",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      positive: "text-positive",
      negative: "text-negative",
      warning: "text-warning",
      info: "text-info",
      destructive: "text-destructive",
      inherit: "",
    },
    align: { start: "text-start", center: "text-center", end: "text-end" },
    wrap: { wrap: "", balance: "text-balance", nowrap: "whitespace-nowrap", truncate: "truncate" },
    numeric: { proportional: "", tabular: "tabular-nums" },
  },
  defaultVariants: { variant: "body", tone: "inherit", align: "start", wrap: "wrap", numeric: "proportional" },
});

type TextElement = "span" | "p" | "div" | "strong" | "em" | "small" | "label" | "dt" | "dd" | "figcaption";

interface TextProps extends Omit<React.ComponentProps<"span">, "color">, VariantProps<typeof textVariants> {
  as?: TextElement;
  asChild?: boolean;
}

/**
 * Text set in a step of the type scale. A heading that belongs in the document outline is a Heading (or the title
 * of a PageHeader, Section, PanelHeader or Card); everything else that is text is this.
 */
export function Text({
  as = "span",
  asChild = false,
  variant,
  tone,
  align,
  wrap,
  numeric,
  className,
  ...props
}: TextProps) {
  const Comp = (asChild ? Slot.Root : as) as "span";
  return (
    <Comp
      data-slot="text"
      className={cn(textVariants({ variant, tone, align, wrap, numeric }), className)}
      {...props}
    />
  );
}
