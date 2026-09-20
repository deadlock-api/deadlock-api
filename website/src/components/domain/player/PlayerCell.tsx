import { Link } from "@tanstack/react-router";
import { cva, type VariantProps } from "class-variance-authority";

import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

const playerCellVariants = cva("flex min-w-0 items-center", {
  variants: {
    /** `sm` for dense panels, `default` for table rows, `lg` for a list of accounts: the id moves under the name. */
    size: { sm: "gap-1.5 text-xs", default: "gap-2", lg: "gap-3 text-sm" },
  },
  defaultVariants: { size: "default" },
});

const AVATAR_SIZE = { sm: "xs", default: "sm", lg: "default" } as const;

/**
 * A player as the identity of a row: Steam avatar, persona name and, on request, the account id. While the Steam
 * profiles load, pass `loading` for a skeleton of the same size; a player without a profile reads "Player <id>".
 */
export function PlayerCell({
  accountId,
  name,
  avatar,
  loading = false,
  showAccountId = false,
  linkToTracker = false,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof playerCellVariants> & {
    accountId?: number | null;
    /** Steam persona name. */
    name?: string | null;
    avatar?: string | null;
    loading?: boolean;
    showAccountId?: boolean;
    /** Links the name to the player's tracker page. Leave it off when the whole row is already the link. */
    linkToTracker?: boolean;
  }) {
  const resolvedSize = size ?? "default";
  const stacked = resolvedSize === "lg";
  const label = name ?? (accountId != null ? `Player ${accountId}` : "Unknown player");

  const nameNode = loading ? (
    <Skeleton className="h-4 w-24" />
  ) : linkToTracker && accountId != null ? (
    <Link
      to="/tracker/players/$accountId"
      params={{ accountId: String(accountId) }}
      title={`Open ${label} in the player tracker`}
      // Rows that hold this cell are often clickable themselves; the link must not trigger them.
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "truncate rounded-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        stacked && "font-medium",
      )}
    >
      {label}
    </Link>
  ) : (
    <span title={label} className={cn("truncate", stacked && "font-medium")}>
      {label}
    </span>
  );

  const idNode = showAccountId && accountId != null && (
    <span data-slot="player-cell-id" className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
      {accountId}
    </span>
  );

  return (
    <span
      data-slot="player-cell"
      data-size={resolvedSize}
      className={cn(playerCellVariants({ size }), className)}
      {...props}
    >
      <SteamAvatar src={avatar} loading={loading} size={AVATAR_SIZE[resolvedSize]} />
      {stacked ? (
        <span className="flex min-w-0 flex-1 flex-col">
          {nameNode}
          {idNode}
        </span>
      ) : (
        <>
          {nameNode}
          {idNode}
        </>
      )}
    </span>
  );
}
