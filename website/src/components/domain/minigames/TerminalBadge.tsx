import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

/**
 * The games' monospace, uppercase take on Badge. `shape="square"` alone still has the control radius: the hard corners
 * come from the `.theme-terminal` scope (`--radius: 0`, set by GamePage).
 */
export function TerminalBadge({ className, shape = "square", ...props }: React.ComponentProps<typeof Badge>) {
  return <Badge shape={shape} className={cn("font-mono tracking-wider uppercase", className)} {...props} />;
}
