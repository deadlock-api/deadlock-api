import { usePostHog } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { AlertCircle, AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AddBotDialog,
  DeleteAccountDialog,
  ReactivateAccountDialog,
  ReplaceAccountDialog,
} from "~/components/patron/AccountDialogs";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { formatCooldownRemaining, formatDate, formatRelativeTime } from "~/lib/format";
import { type PlayerCard, steamId3ToSteamId64 } from "~/lib/patron-api";
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
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BotFriendCell({ steamId3, isActive }: { steamId3: number; isActive: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const cardQuery = usePlayerCard(steamId3, isActive);

  if (!isActive) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (cardQuery.isLoading) {
    return <Skeleton className="h-5 w-20" />;
  }

  if (cardQuery.isError) {
    const err = cardQuery.error;
    const errObj = err as unknown as Record<string, unknown>;
    if (Object.hasOwn(errObj, "invites") && Array.isArray(errObj.invites)) {
      return (
        <>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Add bot friend
          </button>
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
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Badge className="bg-green-600 hover:bg-green-600">
      <CheckCircle className="mr-1 h-3 w-3" />
      Connected
    </Badge>
  );
}

function PlayerCardRankCell({ steamId3, isActive }: { steamId3: number; isActive: boolean }) {
  const cardQuery = usePlayerCard(steamId3, isActive);
  const ranksQuery = useQuery(ranksQueryOptions);

  if (!isActive) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (cardQuery.isLoading || cardQuery.isError) {
    return <span className="text-muted-foreground">—</span>;
  }

  const card = cardQuery.data as PlayerCard;

  if (card.ranked_rank === null || card.ranked_badge_level === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const rank = ranksQuery.data?.find((r) => r.tier === card.ranked_rank);
  // Obscurus (tier 0) has subrank 0 in the card — use 1 for image lookup fallback
  const subrank = (card.ranked_subrank ?? 0) === 0 ? 1 : (card.ranked_subrank as number);
  const imageUrl = getRankImageUrl(rank, subrank, "small", "webp");
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
  const posthog = usePostHog();

  if (!isActive) {
    return <span className="text-muted-foreground">—</span>;
  }

  const handleRefetch = () => {
    refetchMutation.mutate(steamId3, {
      onSuccess: (response) => {
        const count = response.data.length;
        toast.success(`Fetched ${count} match${count !== 1 ? "es" : ""}`);
        posthog?.capture("match_history_refetched", { steam_id3: steamId3, match_count: count });
      },
      onError: (error) => {
        if (isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = Number(error.response.headers["retry-after"]);
          if (retryAfter && retryAfter > 0) {
            const minutes = Math.ceil(retryAfter / 60);
            toast.error(`Rate limited — try again in ${minutes} minute${minutes !== 1 ? "s" : ""}`);
          } else {
            toast.error("Rate limited — please wait before trying again");
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
    <button
      type="button"
      onClick={handleRefetch}
      disabled={refetchMutation.isPending}
      className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refetchMutation.isPending ? "animate-spin" : ""}`} />
      Refetch Match History
    </button>
  );
}

export function SteamAccountsList() {
  const query = useSteamAccounts();
  const deleteSteamAccountMutation = useDeleteSteamAccount();
  const replaceSteamAccountMutation = useReplaceSteamAccount();
  const reactivateSteamAccountMutation = useReactivateSteamAccount();
  const posthog = usePostHog();

  const data = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;
  const error = query.error;

  const handleDeleteAccount = (accountId: string) => {
    deleteSteamAccountMutation.mutate(accountId, {
      onSuccess: () => {
        toast.success("Steam account removed successfully");
        posthog?.capture("steam_account_deleted");
      },
      onError: () => {
        toast.error("Failed to remove Steam account");
      },
    });
  };

  const handleReplaceAccount = (accountId: string, steamId3: number) => {
    replaceSteamAccountMutation.mutate(
      { accountId, steamId3 },
      {
        onSuccess: () => {
          toast.success("Steam account replaced successfully");
          posthog?.capture("steam_account_replaced", { new_steam_id3: steamId3 });
        },
        onError: () => {
          toast.error("Failed to replace Steam account");
        },
      },
    );
  };

  const handleReactivateAccount = (accountId: string) => {
    reactivateSteamAccountMutation.mutate(accountId, {
      onSuccess: () => {
        toast.success("Steam account reactivated successfully");
        posthog?.capture("steam_account_reactivated");
      },
      onError: () => {
        toast.error("Failed to reactivate Steam account");
      },
    });
  };

  if (isLoading) {
    return <SteamAccountsListSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading Steam accounts</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Failed to load Steam accounts"}</AlertDescription>
      </Alert>
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
          <div className="py-8 text-center text-muted-foreground">
            <p>No Steam accounts added yet.</p>
            <p className="mt-1 text-sm">Add a Steam account above to get prioritized data fetching.</p>
          </div>
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
                <TableHead className="w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                const isActive = account.deleted_at === null;
                const cooldownRemaining = account.deleted_at ? formatCooldownRemaining(account.deleted_at) : null;
                const isDeleting =
                  deleteSteamAccountMutation.isPending && deleteSteamAccountMutation.variables === account.id;
                const isReplacing =
                  replaceSteamAccountMutation.isPending &&
                  replaceSteamAccountMutation.variables?.accountId === account.id;
                const isReactivating =
                  reactivateSteamAccountMutation.isPending && reactivateSteamAccountMutation.variables === account.id;
                const canReplace = account.deleted_at !== null && !account.is_in_cooldown;
                const isDeleted = account.deleted_at !== null;

                return (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono">{account.steam_id3}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {steamId3ToSteamId64(account.steam_id3)}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{formatRelativeTime(account.created_at)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{formatDate(account.created_at)}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <Badge className="bg-green-600 hover:bg-green-600">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Active
                        </Badge>
                      ) : account.is_in_cooldown && cooldownRemaining ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="destructive">
                            <XCircle className="mr-1 h-3 w-3" />
                            Removed
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Available in {cooldownRemaining}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Removed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <BotFriendCell steamId3={account.steam_id3} isActive={account.deleted_at === null} />
                    </TableCell>
                    <TableCell>
                      <PlayerCardRankCell steamId3={account.steam_id3} isActive={account.deleted_at === null} />
                    </TableCell>
                    <TableCell>
                      <RefetchMatchHistoryCell steamId3={account.steam_id3} isActive={account.deleted_at === null} />
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <DeleteAccountDialog
                          steamId3={account.steam_id3}
                          onDelete={() => handleDeleteAccount(account.id)}
                          isDeleting={isDeleting}
                        />
                      ) : (
                        <div className="flex gap-1">
                          {canReplace && (
                            <ReplaceAccountDialog
                              oldSteamId3={account.steam_id3}
                              onReplace={(steamId3) => handleReplaceAccount(account.id, steamId3)}
                              isReplacing={isReplacing}
                            />
                          )}
                          {isDeleted && (
                            <ReactivateAccountDialog
                              steamId3={account.steam_id3}
                              onReactivate={() => handleReactivateAccount(account.id)}
                              isReactivating={isReactivating}
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
