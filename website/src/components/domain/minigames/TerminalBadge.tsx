import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

const RESULT = {
  correct: { variant: "positive", glyph: "✓", label: "Correct" },
  wrong: { variant: "negative", glyph: "✗", label: "Wrong" },
} as const;

type TerminalBadgeProps = React.ComponentProps<typeof Badge> &
  (
    | { result?: undefined }
    | {
        /** A judged answer: sets the tone and draws a ✓ / ✗ before the text, read as "Correct" / "Wrong". */
        result: keyof typeof RESULT;
        variant?: never;
      }
  );

/**
 * The games' monospace, uppercase take on Badge. `shape="square"` alone still has the control radius: the hard corners
 * come from the `.theme-terminal` scope (`--radius: 0`, set by GamePage). `result` marks a judged answer with a sign as
 * well as a tone, so the result never rests on color alone.
 */
export function TerminalBadge({
  className,
  shape = "square",
  result,
  variant,
  children,
  ...props
}: TerminalBadgeProps) {
  const judged = result ? RESULT[result] : undefined;
  return (
    <Badge
      shape={shape}
      variant={judged?.variant ?? variant}
      data-result={result}
      className={cn("font-mono tracking-wider uppercase", className)}
      {...props}
    >
      {judged && (
        <>
          <span aria-hidden="true">{judged.glyph}</span>
          <span className="sr-only">{children ? `${judged.label}: ` : judged.label}</span>
        </>
      )}
      {children}
    </Badge>
  );
}
