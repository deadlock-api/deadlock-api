import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const bulletListVariants = cva("flex min-w-0 text-sm text-muted-foreground", {
  variants: {
    /** `horizontal` is a wrapping row of short claims under a call to action. */
    orientation: {
      vertical: "flex-col gap-1.5",
      horizontal: "flex-row flex-wrap items-center gap-x-4 gap-y-1.5",
    },
  },
  defaultVariants: { orientation: "vertical" },
});

const bulletVariants = cva("size-1.5 rounded-full", {
  variants: {
    tone: {
      primary: "bg-primary",
      muted: "bg-muted-foreground",
    },
  },
  defaultVariants: { tone: "primary" },
});

/** A list of short points with a dot each. Numbered instructions are `Steps`; text with paragraphs is `Prose`. */
export function BulletList({
  orientation,
  className,
  ...props
}: React.ComponentProps<"ul"> & VariantProps<typeof bulletListVariants>) {
  return (
    <ul
      data-slot="bullet-list"
      data-orientation={orientation ?? "vertical"}
      className={cn(bulletListVariants({ orientation }), className)}
      {...props}
    />
  );
}

/** One point. The dot sits on the first line however the text wraps. */
export function BulletItem({
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & VariantProps<typeof bulletVariants>) {
  return (
    <li data-slot="bullet-item" className={cn("flex min-w-0 items-start gap-2", className)} {...props}>
      <span aria-hidden="true" className="flex h-lh shrink-0 items-center">
        <span className={bulletVariants({ tone })} />
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
