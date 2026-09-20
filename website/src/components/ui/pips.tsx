import { NoValue } from "~/components/ui/no-value";
import { TONE_BG, type Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";

/** A small count out of a small maximum, as filled and empty marks: ability levels, confidence. */
export function Pips({
  value,
  max,
  tone,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  value: number | null | undefined;
  max: number;
  /** Colors the filled marks. Without it they use the warning color, as ability levels do in the game. */
  tone?: Tone;
  /** Read out in place of the marks: "Level 3 of 4". */
  label: string;
}) {
  if (value == null || !Number.isFinite(value) || max <= 0) {
    return <NoValue className={className} {...props} />;
  }
  return (
    <span
      data-slot="pips"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the marks are drawn with CSS; there is no image file
      role="img"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5", className)}
      {...props}
    >
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-0.5 w-1 rounded-full",
            index < value ? (tone ? TONE_BG[tone] : "bg-warning") : "bg-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
