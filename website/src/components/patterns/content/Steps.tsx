import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

import { cn } from "~/lib/utils";

const stepsVariants = cva("group/steps flex min-w-0 list-none flex-col [counter-reset:step]", {
  variants: {
    size: {
      sm: "gap-1 text-xs",
      default: "gap-3 text-sm",
    },
  },
  defaultVariants: { size: "default" },
});

const markerVariants = cva("tabular-nums", {
  variants: {
    variant: {
      /** A numbered chip: the steps are the content of the block. */
      badge:
        "inline-flex size-5 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-2xs font-semibold text-primary before:content-[counter(step)]",
      /** A plain numeral, for a short list inside an Alert or a Card that already has a frame. */
      plain: "min-w-4 text-muted-foreground before:content-[counter(step)_'.']",
    },
  },
  defaultVariants: { variant: "badge" },
});

type StepsVariant = NonNullable<VariantProps<typeof markerVariants>["variant"]>;

const StepsVariantContext = createContext<StepsVariant>("badge");

/** Numbered instructions. The numbers come from a CSS counter, so steps can be added, removed or conditional. */
export function Steps({
  variant = "badge",
  size = "default",
  className,
  ...props
}: React.ComponentProps<"ol"> & VariantProps<typeof stepsVariants> & { variant?: StepsVariant }) {
  return (
    <StepsVariantContext.Provider value={variant}>
      <ol
        data-slot="steps"
        data-variant={variant}
        data-size={size}
        className={cn(stepsVariants({ size }), className)}
        {...props}
      />
    </StepsVariantContext.Provider>
  );
}

/** One instruction. `title` is the sentence; children are what goes under it: a command to copy, a note, a button. */
export function Step({
  title,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"li">, "title"> & { title?: React.ReactNode }) {
  const variant = useContext(StepsVariantContext);
  return (
    <li
      data-slot="step"
      className={cn("flex min-w-0 gap-3 leading-relaxed group-data-[variant=plain]/steps:gap-1.5", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="step-marker"
        className="flex h-lh shrink-0 items-center [counter-increment:step]"
      >
        <span className={markerVariants({ variant })} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 group-data-[size=sm]/steps:gap-1">
        {title && <p className="text-foreground">{title}</p>}
        {children}
      </div>
    </li>
  );
}
