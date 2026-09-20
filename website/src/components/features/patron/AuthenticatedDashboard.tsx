import { LogOut } from "lucide-react";

import { AddSteamAccountForm } from "~/components/features/patron/AddSteamAccountForm";
import { PatronStatusCard } from "~/components/features/patron/PatronStatusCard";
import { SteamAccountsList } from "~/components/features/patron/SteamAccountsList";
import { NotSubscribedState } from "~/components/features/patron/UnauthenticatedState";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { usePatronStatus } from "~/queries/patron-queries";

export function PatronPageSkeleton() {
  return (
    <PageShell density="content">
      <Stack gap={2}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </Stack>
      <Skeleton className="h-32 w-full" />
    </PageShell>
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
    <PageShell density="content">
      <PageHeader
        title="Patron Dashboard"
        description="Manage your prioritized Steam accounts"
        actions={
          <Button variant="outline" onClick={() => void logout()} disabled={isLoggingOut}>
            {isLoggingOut ? <Spinner /> : <LogOut />}
            Log out
          </Button>
        }
      />

      <PatronStatusCard />

      {hasAvailableSlots && <AddSteamAccountForm />}

      <SteamAccountsList />
    </PageShell>
  );
}
