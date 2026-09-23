import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AddBotDialog,
  DeleteAccountDialog,
  ReactivateAccountDialog,
  ReplaceAccountDialog,
} from "~/components/features/patron/AccountDialogs";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { Tooltip } from "~/components/ui/tooltip";
import { formatCooldownRemaining, formatDate, formatRelativeTime } from "~/lib/format";
import { type PlayerCard, type SteamAccount, steamId3ToSteamId64 } from "~/lib/patron-api";
import { getRankImageUrl, getRankLabel } from "~/lib/rank-utils";
import {
  useDeleteSteamAccount,
  usePlayerCard,
  useReactivateSteamAccount,
  useRefetchMatchHistory,
  useReplaceSteamAccount,
  useSteamAccounts,
} from "~/queries/patron-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

function SteamAccountsListSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

type CardQuery = ReturnType<typeof usePlayerCard>;

function BotFriendCell({ cardQuery }: { cardQuery: CardQuery }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (cardQuery.isLoading) {
    return <Skeleton className="h-5 w-20" />;
  }

  if (cardQuery.isError) {
    const err = cardQuery.error;
    const errObj = err as unknown as Record<string, unknown>;
    if (Object.hasOwn(errObj, "invites") && Array.isArray(errObj.invites)) {
      return (
        <>
          <Tooltip content="The bot needs to be your Steam friend to access your match history for priority ingestion">
            <Button variant="destructive-soft" size="xs" onClick={() => setDialogOpen(true)}>
              <AlertTriangle />
              Add bot friend
            </Button>
          </Tooltip>
          <AddBotDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            invites={errObj.invites as string[]}
            isChecking={cardQuery.isFetching}
            onCheck={() => cardQuery.refetch()}
          />
        </>
      );
    }
    return <NoValue />;
  }

  return (
    <Badge variant="positive">
      <CheckCircle />
      Connected
    </Badge>
  );
}

function PlayerCardRankCell({ cardQuery }: { cardQuery: CardQuery }) {
  const ranksQuery = useQuery(ranksQueryOptions);

  if (cardQuery.isLoading || cardQuery.isError) {
    return <NoValue />;
  }

  const card = cardQuery.data as PlayerCard;

  if (card.ranked_rank === null || card.ranked_badge_level === null) {
    return <NoValue />;
  }

  const rank = ranksQuery.data?.find((r) => r.tier === card.ranked_rank);
  // Obscurus (tier 0) has subrank 0 in the card — use 1 for image lookup fallback
  const subrank = (card.ranked_subrank ?? 0) === 0 ? 1 : (card.ranked_subrank as number);
  const imageUrl = getRankImageUrl(rank, "webp");
  const label = rank ? getRankLabel(rank, subrank) : `${card.ranked_rank}·${card.ranked_subrank}`;

  return (
    <div className="flex items-center gap-1.5">
      {imageUrl && <img src={imageUrl} alt={label} className="size-6 object-contain" />}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function RefetchMatchHistoryCell({ steamId3, isActive }: { steamId3: number; isActive: boolean }) {
  const refetchMutation = useRefetchMatchHistory();

  if (!isActive) {
    return <NoValue />;
  }

  const handleRefetch = () => {
    refetchMutation.mutate(steamId3, {
      onSuccess: (response) => {
        const count = response.data.length;
        toast.success(`Fetched ${count} match${count !== 1 ? "es" : ""}`);
      },
      onError: (error) => {
        if (isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = Number(error.response.headers["retry-after"]);
          if (retryAfter && retryAfter > 0) {
            const minutes = Math.ceil(retryAfter / 60);
            toast.error(`Rate limited, try again in ${minutes} minute${minutes !== 1 ? "s" : ""}`);
          } else {
            toast.error("Rate limited, please wait before trying again");
          }
        } else if (isAxiosError(error)) {
          const detail = error.response?.data?.detail ?? error.response?.data?.message;
          toast.error(detail ?? `Request failed (${error.response?.status ?? "network error"})`);
        } else {
          toast.error(error instanceof Error ? error.message : "Failed to refetch match history");
        }
      },
    });
  };

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={handleRefetch}
      disabled={refetchMutation.isPending}
      className="text-muted-foreground"
    >
      {refetchMutation.isPending ? <Spinner size="xs" /> : <RefreshCw />}
      Refetch Match History
    </Button>
  );
}

function AccountRow({
  account,
  onDelete,
  isDeleting,
  onReplace,
  isReplacing,
  onReactivate,
  isReactivating,
}: {
  account: SteamAccount;
  onDelete: () => void;
  isDeleting: boolean;
  onReplace: (steamId3: number) => Promise<void>;
  isReplacing: boolean;
  onReactivate: () => void;
  isReactivating: boolean;
}) {
  const isActive = account.deleted_at === null;
  const cardQuery = usePlayerCard(account.steam_id3, isActive);
  const cooldownRemaining = account.deleted_at ? formatCooldownRemaining(account.deleted_at) : null;
  const canReplace = account.deleted_at !== null && !account.is_in_cooldown;
  const isDeleted = account.deleted_at !== null;

  return (
    <TableRow>
      <TableCell className="font-mono">
        <TextLink tone="inherit" asChild>
          <Link
            to="/tracker/players/$accountId"
            params={{ accountId: String(account.steam_id3) }}
            title="Open player tracker"
          >
            {account.steam_id3}
          </Link>
        </TextLink>
      </TableCell>
      <TableCell className="font-mono text-muted-foreground">
        <TextLink
          tone="muted"
          external
          href={`https://steamcommunity.com/profiles/${steamId3ToSteamId64(account.steam_id3)}`}
        >
          {steamId3ToSteamId64(account.steam_id3)}
        </TextLink>
      </TableCell>
      <TableCell>
        <Tooltip content={formatDate(account.created_at)}>
          <span>{formatRelativeTime(account.created_at)}</span>
        </Tooltip>
      </TableCell>
      <TableCell>
        {isActive ? (
          <Badge variant="positive">
            <CheckCircle />
            Active
          </Badge>
        ) : account.is_in_cooldown && cooldownRemaining ? (
          <div className="flex flex-col gap-1">
            <Badge variant="destructive">
              <XCircle />
              Removed
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Available in {cooldownRemaining}
            </span>
          </div>
        ) : (
          <Badge variant="destructive">
            <XCircle />
            Removed
          </Badge>
        )}
      </TableCell>
      <TableCell>{isActive ? <BotFriendCell cardQuery={cardQuery} /> : <NoValue />}</TableCell>
      <TableCell>{isActive ? <PlayerCardRankCell cardQuery={cardQuery} /> : <NoValue />}</TableCell>
      <TableCell>
        <RefetchMatchHistoryCell steamId3={account.steam_id3} isActive={isActive} />
      </TableCell>
      <TableCell>
        {isActive ? (
          <DeleteAccountDialog steamId3={account.steam_id3} onDelete={onDelete} isDeleting={isDeleting} />
        ) : (
          <div className="flex gap-1">
            {canReplace && (
              <ReplaceAccountDialog oldSteamId3={account.steam_id3} onReplace={onReplace} isReplacing={isReplacing} />
            )}
            {isDeleted && (
              <ReactivateAccountDialog
                steamId3={account.steam_id3}
                onReactivate={onReactivate}
                isReactivating={isReactivating}
              />
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function SteamAccountsList() {
  const query = useSteamAccounts();
  const deleteSteamAccountMutation = useDeleteSteamAccount();
  const replaceSteamAccountMutation = useReplaceSteamAccount();
  const reactivateSteamAccountMutation = useReactivateSteamAccount();

  const data = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;
  const error = query.error;

  const handleDeleteAccount = (accountId: string) => {
    deleteSteamAccountMutation.mutate(accountId, {
      onSuccess: () => {
        toast.success("Steam account removed successfully");
      },
      onError: (error) => {
        toast.error("Failed to remove Steam account", { description: error.message });
      },
    });
  };

  // Resolves once the replacement is saved, so the dialog stays open (with the typed ID) until then.
  const handleReplaceAccount = async (accountId: string, steamId3: number) => {
    await replaceSteamAccountMutation.mutateAsync({ accountId, steamId3 });
    toast.success("Steam account replaced successfully");
  };

  const handleReactivateAccount = (accountId: string) => {
    reactivateSteamAccountMutation.mutate(accountId, {
      onSuccess: () => {
        toast.success("Steam account reactivated successfully");
      },
      onError: (error) => {
        toast.error("Failed to reactivate Steam account", { description: error.message });
      },
    });
  };

  if (isLoading) {
    return <SteamAccountsListSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Error loading Steam accounts"
        description={error instanceof Error ? error.message : "Failed to load Steam accounts"}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { accounts } = data ?? { accounts: [] };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prioritized Accounts</CardTitle>
        <CardDescription>Your Steam accounts with priority data fetching</CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <EmptyState
            variant="inline"
            title="No Steam accounts added yet."
            description="Add a Steam account above to get prioritized data fetching."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SteamID3</TableHead>
                <TableHead>SteamID64</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bot Friend</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Refetch</TableHead>
                <TableHead className="w-15">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onDelete={() => handleDeleteAccount(account.id)}
                  isDeleting={
                    deleteSteamAccountMutation.isPending && deleteSteamAccountMutation.variables === account.id
                  }
                  onReplace={(steamId3) => handleReplaceAccount(account.id, steamId3)}
                  isReplacing={
                    replaceSteamAccountMutation.isPending &&
                    replaceSteamAccountMutation.variables?.accountId === account.id
                  }
                  onReactivate={() => handleReactivateAccount(account.id)}
                  isReactivating={
                    reactivateSteamAccountMutation.isPending && reactivateSteamAccountMutation.variables === account.id
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
