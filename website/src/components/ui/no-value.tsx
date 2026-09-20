import { cn } from "~/lib/utils";

/** The dash in a cell that has nothing to show. A screen reader hears the label instead of "em dash". */
export function NoValue({
  label = "No value",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { label?: string }) {
  return (
    <span data-slot="no-value" className={cn("text-muted-foreground", className)} {...props}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
