import { NoValue } from "~/components/ui/no-value";
import { TONE_TEXT, type Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";

const INLINE_STAT_SIZE = {
  /** In the type around it: "412 matches" in a sentence or a cell. */
  default: { root: "", value: "", label: "" },
  /** The lead number of a panel, with its caption on the same baseline: "1,204 matches played". */
  lg: { root: "flex flex-wrap items-baseline gap-x-2", value: "text-lg", label: "text-xs" },
};

/** A value and its unit or label on one line of text: "412 matches", "54.1% win rate". The value is in ink. */
export function InlineStat({
  value,
  label,
  size = "default",
  tone,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  value: React.ReactNode;
  label: React.ReactNode;
  size?: keyof typeof INLINE_STAT_SIZE;
  /** Colors the value by its verdict; keep a sign or a word beside it, never the color alone. */
  tone?: Tone;
}) {
  const sizes = INLINE_STAT_SIZE[size];
  return (
    // The value never breaks; a label too long for its container wraps after it rather than running out of the row.
    <span
      data-slot="inline-stat"
      data-size={size}
      className={cn("text-muted-foreground", sizes.root, className)}
      {...props}
    >
      <span
        className={cn(
          "font-semibold whitespace-nowrap text-foreground tabular-nums",
          sizes.value,
          tone && TONE_TEXT[tone],
        )}
      >
        {value ?? <NoValue />}
      </span>{" "}
      <span className={sizes.label}>{label}</span>
    </span>
  );
}
