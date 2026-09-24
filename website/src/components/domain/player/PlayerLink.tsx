import { Link } from "@tanstack/react-router";

import { TextLink } from "~/components/ui/text-link";
import { cn } from "~/lib/utils";

/**
 * A player's name as a link to their tracker page. It keeps the color of the text around it and turns primary and
 * underlined on hover, so a column of names stays calm until the pointer reaches one.
 */
export function PlayerLink({
  accountId,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & {
  accountId: number;
}) {
  return (
    <TextLink asChild tone="inherit" className={cn("truncate", className)}>
      <Link
        data-slot="player-link"
        to="/tracker/players/$accountId"
        params={{ accountId: String(accountId) }}
        {...props}
      >
        {children ?? `Player ${accountId}`}
      </Link>
    </TextLink>
  );
}
