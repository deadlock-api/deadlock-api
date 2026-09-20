import { NoValue } from "~/components/ui/no-value";
import { cn } from "~/lib/utils";

/** A value and its unit or label on one line of text: "412 matches", "54.1% win rate". The value is in ink. */
export function InlineStat({
  value,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { value: React.ReactNode; label: React.ReactNode }) {
  return (
    // The value never breaks; a label too long for its container wraps after it rather than running out of the row.
    <span data-slot="inline-stat" className={cn("text-muted-foreground", className)} {...props}>
      <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{value ?? <NoValue />}</span>{" "}
      {label}
    </span>
  );
}
