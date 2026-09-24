import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";

import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { Button } from "~/components/ui/button";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { TextLink } from "~/components/ui/text-link";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
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

const NO_ACCOUNTS: number[] = [];

/**
 * A name that may belong to several accounts, such as a leaderboard entry that the API matched to more than one
 * player. One account links straight to its tracker page; several open a list of the candidates, each with its Steam
 * name and avatar; none leaves the name as plain text.
 */
export function PlayerNameLink({
  name,
  accountIds = NO_ACCOUNTS,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  /** The name to show; without one the first account reads "Player <id>". */
  name?: string | null;
  /** Every account the name may belong to. */
  accountIds?: number[];
}) {
  const label = name ?? (accountIds[0] != null ? `Player ${accountIds[0]}` : "Unknown player");
  const [onlyAccountId] = accountIds;

  return (
    <span data-slot="player-name-link" className={cn("flex min-w-0 items-center", className)} {...props}>
      {accountIds.length === 0 ? (
        <span title={label} className="truncate">
          {label}
        </span>
      ) : accountIds.length === 1 ? (
        <PlayerLink accountId={onlyAccountId} title={`Open ${label} in the player tracker`}>
          {label}
        </PlayerLink>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="text"
              size="inline"
              className="min-h-6 max-w-full shrink font-normal"
              title={`${label} matches ${accountIds.length} accounts`}
            >
              <span className="min-w-0 truncate">{label}</span>
              <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="sr-only">, {accountIds.length} possible accounts</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            collisionPadding={16}
            aria-label={`Accounts that may be ${label}`}
            className="flex w-64 max-w-(--radix-popover-content-available-width) flex-col gap-0.5 p-1.5"
          >
            <PlayerAccountOptions label={label} accountIds={accountIds} />
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** Mounted only while the popover is open, so the Steam profiles load on demand. */
function PlayerAccountOptions({ label, accountIds }: { label: string; accountIds: number[] }) {
  const { profiles, isLoading } = useSteamProfiles(accountIds);
  return (
    <>
      <p className="px-2 pt-1 pb-1.5 eyebrow text-muted-foreground">{accountIds.length} possible accounts</p>
      {accountIds.map((accountId) => {
        const profile = profiles[accountId];
        return (
          <OptionRow
            key={accountId}
            asChild
            leading={<SteamAvatar src={profile?.avatar} loading={isLoading && !profile} size="sm" />}
            description={<span className="font-mono tabular-nums">{accountId}</span>}
          >
            <Link
              to="/tracker/players/$accountId"
              params={{ accountId: String(accountId) }}
              title={`Open account ${accountId} in the player tracker`}
            >
              {profile?.personaname ?? label}
            </Link>
          </OptionRow>
        );
      })}
    </>
  );
}
