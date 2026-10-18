import { LogOut } from "lucide-react";
import { useState } from "react";

import { AddSteamAccountForm } from "~/components/features/patron/AddSteamAccountForm";
import { BotFriendWarning, NewAccountBotDialog } from "~/components/features/patron/BotFriendWarning";
import { PatronStatusCard } from "~/components/features/patron/PatronStatusCard";
import { SteamAccountsList } from "~/components/features/patron/SteamAccountsList";
import { NotSubscribedState } from "~/components/features/patron/UnauthenticatedState";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { usePatronStatus } from "~/queries/patron-queries";

/** The page while the patron's status loads: the real heading, so the page has its h1, and a polite loading status. */
export function PatronPageSkeleton() {
  return (
    <PageShell density="content">
      <PageHeader title="Patron Dashboard" />
      <LoadingState size="sm" label="your patron status" />
    </PageShell>
  );
}

export function AuthenticatedDashboard() {
  const query = usePatronStatus();
  const { logout, isLoggingOut } = usePatronAuth();
  // The account just added: the bot friend dialog opens for it, as it is not prioritized without one.
  const [addedSteamId3, setAddedSteamId3] = useState<number | null>(null);
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

      <BotFriendWarning />

      <PatronStatusCard />

      {hasAvailableSlots && <AddSteamAccountForm onAdded={setAddedSteamId3} />}

      <SteamAccountsList />

      <NewAccountBotDialog steamId3={addedSteamId3} onClose={() => setAddedSteamId3(null)} />
    </PageShell>
  );
}
