import { useQueries } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";

import { AddSteamAccountForm } from "~/components/patron/AddSteamAccountForm";
import { PatronStatusCard } from "~/components/patron/PatronStatusCard";
import { SteamAccountsList } from "~/components/patron/SteamAccountsList";
import { NotSubscribedState } from "~/components/patron/UnauthenticatedState";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Skeleton } from "~/components/ui/skeleton";
import { playerCardQueryOptions, usePatronStatus, useSteamAccounts } from "~/queries/patron-queries";

export function PatronPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function AuthenticatedDashboard() {
  const query = usePatronStatus();
  const status = query.data;
  const isLoading = query.isLoading;
  const hasAvailableSlots = (status?.steam_accounts_summary.available_slots ?? 0) > 0;
  const totalSlots = status?.total_slots ?? 0;

  const accountsQuery = useSteamAccounts();
  const activeAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => a.deleted_at === null);

  const cardQueries = useQueries({
    queries: activeAccounts.map((a) => ({ ...playerCardQueryOptions(a.steam_id3), enabled: true })),
  });

  const hasUnfriendedAccount = cardQueries.some((q) => {
    if (!q.isError) return false;
    const err = q.error as unknown as Record<string, unknown>;
    return Object.hasOwn(err, "invites") && Array.isArray(err.invites);
  });

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  // 0/0 state: user is authed but has no subscription / 0 slots
  if (totalSlots === 0) {
    return <NotSubscribedState />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Patron Dashboard</h1>
        <p className="text-muted-foreground">Manage your prioritized Steam accounts</p>
      </div>

      <PatronStatusCard />

      {hasUnfriendedAccount && (
        <Alert className="border-primary/30 bg-primary/5">
          <UserPlus className="h-4 w-4" />
          <AlertTitle>Add our bot as a Steam friend</AlertTitle>
          <AlertDescription>
            Some of your accounts are not yet friends with one of our bots. Priority data fetching only works for
            accounts that have a bot friend. Click the "Add bot" button in the Rank column below to get an invite link,
            then accept the friend request in Steam.
          </AlertDescription>
        </Alert>
      )}

      {hasAvailableSlots && <AddSteamAccountForm />}

      <SteamAccountsList />
    </div>
  );
}
