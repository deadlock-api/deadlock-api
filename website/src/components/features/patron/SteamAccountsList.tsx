import { Link } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, UserSearch, XCircle } from "lucide-react";
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
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { formatCooldownRemaining, formatDate, formatRelativeTime } from "~/lib/format";
import { type SteamAccount, steamId3ToSteamId64 } from "~/lib/patron-api";
import {
  useBotFriendStatus,
  useDeleteSteamAccount,
  useReactivateSteamAccount,
  useRefetchMatchHistory,
  useReplaceSteamAccount,
  useSteamAccounts,
} from "~/queries/patron-queries";

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

type BotFriendQuery = ReturnType<typeof useBotFriendStatus>;

function BotFriendCell({ botFriendQuery }: { botFriendQuery: BotFriendQuery }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (botFriendQuery.isLoading) {
    return <Skeleton className="h-5 w-20" />;
  }

  const status = botFriendQuery.data;
  if (!status) {
    return <NoValue />;
  }

  if (!status.is_friend) {
    return (
      <>
        <Button variant="destructive-soft" size="xs" onClick={() => setDialogOpen(true)}>
          <AlertTriangle />
          Add bot friend
        </Button>
        <AddBotDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          invites={status.invites}
          isChecking={botFriendQuery.isFetching}
          onCheck={() => botFriendQuery.refetch()}
        />
      </>
    );
  }

  return (
    <Badge variant="positive">
      <CheckCircle />
      Connected
    </Badge>
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
  const botFriendQuery = useBotFriendStatus(account.steam_id3, isActive);
  const cooldownRemaining = account.deleted_at ? formatCooldownRemaining(account.deleted_at) : null;
  const canReplace = account.deleted_at !== null && !account.is_in_cooldown;
  const isDeleted = account.deleted_at !== null;
  const steamId64 = steamId3ToSteamId64(account.steam_id3);

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
        <TextLink tone="muted" external href={`https://steamcommunity.com/profiles/${steamId64}`}>
          {steamId64}
        </TextLink>
      </TableCell>
      <TableCell>
        <Tooltip content={formatDate(account.created_at)}>
          <TooltipTarget>{formatRelativeTime(account.created_at)}</TooltipTarget>
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
      <TableCell>{isActive ? <BotFriendCell botFriendQuery={botFriendQuery} /> : <NoValue />}</TableCell>
      <TableCell>
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link to="/tracker/players/$accountId" params={{ accountId: String(account.steam_id3) }} preload="intent">
            <UserSearch />
            Player Tracker
          </Link>
        </Button>
      </TableCell>
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

  const { data, isLoading, isError, error } = query;

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
          <Table aria-label="Prioritized accounts">
            <TableHeader>
              <TableRow>
                <TableHead>SteamID3</TableHead>
                <TableHead>SteamID64</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bot Friend</TableHead>
                <TableHead>Tracker</TableHead>
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
