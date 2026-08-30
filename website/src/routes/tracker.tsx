import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { seo } from "~/lib/seo";
import { steamAccountsQueryOptions } from "~/queries/patron-queries";

export const Route = createFileRoute("/tracker")({
  component: TrackerLandingPage,
  head: () =>
    seo({
      title: "Player Tracker | Deadlock",
      description:
        "Track your Deadlock matches: full match history, rank progression, hero breakdowns, and mate & opponent analytics for your prioritized Steam accounts.",
      path: "/tracker",
    }),
});

function AccountRow({ accountId, avatar, name }: { accountId: number; avatar?: string; name: string }) {
  return (
    <Link
      to="/players/$accountId"
      params={{ accountId: String(accountId) }}
      className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent"
    >
      {avatar ? (
        <img src={avatar} alt="" className="size-8 rounded-full" loading="lazy" />
      ) : (
        <div className="size-8 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="font-mono text-xs text-muted-foreground">{accountId}</div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function MyAccountsCard() {
  const { isAuthenticated, isActive, isLoading, login, totalSlots } = usePatronAuth();

  const accountsQuery = useQuery({ ...steamAccountsQueryOptions(), enabled: isAuthenticated });
  const activeAccounts = useMemo(
    () => accountsQuery.data?.accounts.filter((account) => account.deleted_at === null) ?? [],
    [accountsQuery.data],
  );
  const accountIds = useMemo(() => activeAccounts.map((account) => account.steam_id3), [activeAccounts]);
  const { profiles } = useSteamProfiles(accountIds);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your accounts</CardTitle>
        <CardDescription>Prioritized Steam accounts on your Patreon subscription</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading || (isAuthenticated && accountsQuery.isPending) ? (
          <div className="space-y-2 px-3 py-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-3 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Sign in with Patreon to see your prioritized accounts here. The tracker is available for linked patron
              accounts only.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={login}>
                Sign in with Patreon
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/patron">Learn more</Link>
              </Button>
            </div>
          </div>
        ) : activeAccounts.length === 0 ? (
          <div className="space-y-3 px-3 py-2">
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
          activeAccounts.map((account) => (
            <AccountRow
              key={account.id}
              accountId={account.steam_id3}
              avatar={profiles[account.steam_id3]?.avatar}
              name={profiles[account.steam_id3]?.personaname ?? `Player ${account.steam_id3}`}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TrackerLandingPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Player Tracker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Match history, rank progression, hero breakdowns, and mate &amp; opponent analytics
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Available for the prioritized Steam accounts linked to your Patreon subscription. Pick one of your accounts
          below.
        </p>
      </div>
      <MyAccountsCard />
    </div>
  );
}
