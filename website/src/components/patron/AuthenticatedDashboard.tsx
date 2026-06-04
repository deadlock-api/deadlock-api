import { Loader2, LogOut } from "lucide-react";

import { AddSteamAccountForm } from "~/components/patron/AddSteamAccountForm";
import { PatronStatusCard } from "~/components/patron/PatronStatusCard";
import { SteamAccountsList } from "~/components/patron/SteamAccountsList";
import { NotSubscribedState } from "~/components/patron/UnauthenticatedState";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { usePatronStatus } from "~/queries/patron-queries";

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
  const { logout, isLoggingOut } = usePatronAuth();
  const status = query.data;
  const isLoading = query.isLoading;
  const hasAvailableSlots = (status?.steam_accounts_summary.available_slots ?? 0) > 0;
  const totalSlots = status?.total_slots ?? 0;

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  // 0/0 state: user is authed but has no subscription / 0 slots
  if (totalSlots === 0) {
    return <NotSubscribedState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patron Dashboard</h1>
          <p className="text-muted-foreground">Manage your prioritized Steam accounts</p>
        </div>
        <Button variant="outline" onClick={() => void logout()} disabled={isLoggingOut}>
          {isLoggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          Log out
        </Button>
      </div>

      <PatronStatusCard />

      {hasAvailableSlots && <AddSteamAccountForm />}

      <SteamAccountsList />
    </div>
  );
}
