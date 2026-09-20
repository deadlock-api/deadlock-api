import { cva, type VariantProps } from "class-variance-authority";

import { NoValue } from "~/components/ui/no-value";
import { cn } from "~/lib/utils";

const keyValueListVariants = cva("flex min-w-0 flex-col", {
  variants: {
    /** `divided` rules between the rows, for a panel; `plain` without, for a card or a dense aside. */
    variant: { divided: "divide-y divide-border/60 *:py-1", plain: "gap-1" },
    size: { sm: "text-xs", default: "text-sm" },
  },
  defaultVariants: { variant: "divided", size: "sm" },
});

/**
 * Labelled values, one per row: a muted label on the leading edge, the value in ink on the trailing edge, numbers
 * aligned. Inside a tooltip use TooltipStats, its sibling.
 */
function KeyValueList({
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<"dl"> & VariantProps<typeof keyValueListVariants>) {
  return (
    <dl data-slot="key-value-list" className={cn(keyValueListVariants({ variant, size }), className)} {...props} />
  );
}

function KeyValue({
  label,
  value,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  /** The value; `children` is accepted as an alias for markup-heavy values. */
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div data-slot="key-value" className={cn("flex items-center justify-between gap-3", className)} {...props}>
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="max-w-2/3 min-w-0 shrink-0 truncate text-end font-medium tabular-nums">
        {value ?? children ?? <NoValue />}
      </dd>
    </div>
  );
}

export { KeyValue, KeyValueList };
