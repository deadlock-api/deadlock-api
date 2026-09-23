import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { TrackerAccountList } from "~/components/features/tracker/shared/TrackerAccountList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Stack } from "~/components/ui/stack";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { seo } from "~/lib/seo";
import { steamAccountsQueryOptions } from "~/queries/patron-queries";

export const Route = createFileRoute("/tracker")({
  component: TrackerRoute,
  head: () =>
    seo({
      title: "Player Tracker | Deadlock",
      description:
        "Track your Deadlock matches: full match history, rank progression, hero breakdowns, and mate & opponent analytics for your prioritized Steam accounts.",
      path: "/tracker",
    }),
});

function TrackerRoute() {
  return (
    <PatronAuthProvider>
      <TrackerLandingPage />
    </PatronAuthProvider>
  );
}

function MyAccountsCard() {
  const { isAuthenticated, isActive, isLoading, isResolved, statusError, refreshStatus, totalSlots } = usePatronAuth();
  const [retryingStatus, setRetryingStatus] = useState(false);

  const accountsQuery = useQuery({ ...steamAccountsQueryOptions(), enabled: isAuthenticated });
  const activeAccounts = useMemo(
    () => accountsQuery.data?.accounts.filter((account) => account.deleted_at === null) ?? [],
    [accountsQuery.data],
  );
  const accountIds = useMemo(() => activeAccounts.map((account) => account.steam_id3), [activeAccounts]);
  const { profiles } = useSteamProfiles(accountIds);

  const navigate = useNavigate();
  const soleAccountId = activeAccounts.length === 1 ? activeAccounts[0].steam_id3 : undefined;
  useEffect(() => {
    if (soleAccountId === undefined) return;
    navigate({ to: "/tracker/players/$accountId", params: { accountId: String(soleAccountId) }, replace: true });
  }, [navigate, soleAccountId]);

  // Without a sign-in there are no accounts to list, so the visitor gets the demo profile and its sign-in prompt.
  // Only once the status has answered: before that a signed-in patron also reads as signed out, and a failed status
  // request says nothing about the session.
  const signedOut = isResolved && !statusError && !isAuthenticated;
  useEffect(() => {
    if (signedOut) navigate({ to: "/tracker/demo", replace: true });
  }, [navigate, signedOut]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your accounts</CardTitle>
        <CardDescription>Prioritized Steam accounts on your Patreon subscription</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {statusError ? (
          <ErrorState
            title="Could not check your sign-in"
            description="The Patreon status is temporarily unavailable. Try again in a moment."
            onRetry={() => {
              setRetryingStatus(true);
              void refreshStatus().finally(() => setRetryingStatus(false));
            }}
            retrying={retryingStatus}
          />
        ) : isLoading ||
          !isResolved ||
          signedOut ||
          (isAuthenticated && accountsQuery.isPending) ||
          soleAccountId !== undefined ? (
          <div className="flex flex-col gap-2 px-3 py-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : accountsQuery.isError && activeAccounts.length === 0 ? (
          <ErrorState
            title="Could not load your accounts"
            description="Your account list is temporarily unavailable. Try loading it again."
            onRetry={() => accountsQuery.refetch()}
            retrying={accountsQuery.isFetching}
          />
        ) : activeAccounts.length === 0 ? (
          <div className="flex flex-col gap-3 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              {isActive || totalSlots > 0
                ? "You haven't added any Steam accounts yet. Add one on the Prioritized Fetching page."
                : "Your Patreon membership is inactive. Reactivate it to use the tracker."}
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/patron">Manage accounts</Link>
            </Button>
          </div>
        ) : (
          <>
            {accountsQuery.isError && (
              <ErrorState
                title="Could not refresh your accounts"
                description="Showing the last loaded account list. Recent changes may not appear yet."
                onRetry={() => accountsQuery.refetch()}
                retrying={accountsQuery.isFetching}
              />
            )}
            <TrackerAccountList
              accounts={activeAccounts.map((account) => ({
                accountId: account.steam_id3,
                avatar: profiles[account.steam_id3]?.avatar,
                name: profiles[account.steam_id3]?.personaname ?? `Player ${account.steam_id3}`,
              }))}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrackerLandingPage() {
  return (
    <PageShell width="narrow" density="content">
      <PageHeader
        size="lg"
        title="Player Tracker"
        description={
          <Stack gap={2} asChild>
            <span>
              <span>Match history, rank progression, hero breakdowns, and mate &amp; opponent analytics</span>
              <span>
                Available for the prioritized Steam accounts linked to your Patreon subscription. Pick one of your
                accounts below.
              </span>
            </span>
          </Stack>
        }
      />
      <MyAccountsCard />
    </PageShell>
  );
}
