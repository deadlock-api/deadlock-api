import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "~/lib/utils";

const disclosureVariants = cva("group/disclosure min-w-0", {
  variants: {
    variant: {
      /** A full-width row inside a Card or Panel that already has a frame. */
      plain: "",
      /** Its own frame, for a disclosure that stands alone between other blocks. */
      bordered: "overflow-hidden rounded-md border",
      /** A quiet line of text that reveals a footnote: "What's a Steam ID?", "About this data". */
      inline: "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "plain" },
});

const summaryVariants = cva(
  "flex cursor-pointer list-none items-center gap-2 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0 [&::-webkit-details-marker]:hidden",
  {
    variants: {
      variant: {
        plain: "w-full justify-between rounded-md font-semibold hover:bg-accent",
        bordered: "w-full justify-between font-medium hover:bg-muted/50 focus-visible:ring-inset",
        inline: "w-fit rounded-sm hover:text-foreground",
      },
      size: {
        sm: "text-xs [&_svg]:size-3.5",
        default: "text-sm [&_svg]:size-4",
        lg: "text-base [&_svg]:size-4",
      },
    },
    compoundVariants: [
      { variant: "plain", size: "sm", class: "px-2 py-1.5" },
      { variant: "plain", size: "default", class: "px-3 py-2" },
      { variant: "plain", size: "lg", class: "p-4" },
      { variant: "bordered", size: "sm", class: "px-2.5 py-2" },
      { variant: "bordered", size: "default", class: "p-3" },
      { variant: "bordered", size: "lg", class: "p-4" },
      { variant: "inline", class: "min-h-6 px-1" },
    ],
    defaultVariants: { variant: "plain", size: "default" },
  },
);

const bodyVariants = cva("min-w-0", {
  variants: {
    variant: {
      plain: "ps-3 pt-3 pb-2",
      bordered: "border-t p-3",
      inline: "pt-2 text-sm leading-relaxed",
    },
  },
  defaultVariants: { variant: "plain" },
});

interface DisclosureProps
  extends Omit<React.ComponentProps<"details">, "title" | "onToggle">, VariantProps<typeof summaryVariants> {
  title: React.ReactNode;
  /** An icon before the title. */
  icon?: React.ReactNode;
  /** Controlled state. Leave out, with `defaultOpen`, to let the element keep its own. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A title row that reveals its body. A native `<details>`: the body is in the document when closed, so it is
 * indexed and found by the browser's page search, and `name` makes a group of them exclusive.
 */
export function Disclosure({
  title,
  icon,
  variant = "plain",
  size = "default",
  open,
  defaultOpen,
  onOpenChange,
  className,
  children,
  ...props
}: DisclosureProps) {
  return (
    <details
      data-slot="disclosure"
      data-variant={variant}
      open={open ?? defaultOpen}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) onOpenChange?.(event.currentTarget.open);
      }}
      className={cn(disclosureVariants({ variant }), className)}
      {...props}
    >
      <summary data-slot="disclosure-trigger" className={summaryVariants({ variant, size })}>
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="min-w-0">{title}</span>
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="text-muted-foreground transition-transform duration-fast ease-standard group-open/disclosure:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div data-slot="disclosure-content" className={bodyVariants({ variant })}>
        {children}
      </div>
    </details>
  );
}
