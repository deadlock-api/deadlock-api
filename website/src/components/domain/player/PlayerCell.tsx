import { cva, type VariantProps } from "class-variance-authority";

import { PlayerLink } from "~/components/domain/player/PlayerLink";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

const playerCellVariants = cva("flex min-w-0 items-center", {
  variants: {
    /** `sm` for dense panels, `default` for table rows. */
    size: { sm: "gap-1.5 text-xs", default: "gap-2" },
  },
  defaultVariants: { size: "default" },
});

const AVATAR_SIZE = { sm: "xs", default: "sm" } as const;

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
  linkToDetail = false,
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
    /** The account id after the name, from the `sm` breakpoint up. */
    showAccountId?: boolean;
    /** Links the name to the player's tracker page. Leave it off when the whole row is already the link. */
    linkToDetail?: boolean;
  }) {
  const resolvedSize = size ?? "default";
  const label = name ?? (accountId != null ? `Player ${accountId}` : "Unknown player");

  const nameNode = loading ? (
    <Skeleton className="h-4 w-24" />
  ) : linkToDetail && accountId != null ? (
    <PlayerLink
      accountId={accountId}
      title={`Open ${label} in the player tracker`}
      // Rows that hold this cell are often clickable themselves; the link must not trigger them.
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </PlayerLink>
  ) : (
    <span title={label} className="truncate">
      {label}
    </span>
  );

  const idNode = showAccountId && accountId != null && (
    // Hidden on a phone, where it took the width of the stat column beside the name.
    <span
      data-slot="player-cell-id"
      className="hidden shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:inline"
    >
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
      {nameNode}
      {idNode}
    </span>
  );
}
