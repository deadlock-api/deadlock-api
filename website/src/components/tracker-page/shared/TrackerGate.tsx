import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Lock, ShieldX } from "lucide-react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { IS_DEV } from "~/lib/constants";
import { steamAccountsQueryOptions } from "~/queries/patron-queries";

function GateCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">{icon}</div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function TrackerGate({ accountId, children }: { accountId: number; children: React.ReactNode }) {
  const { isAuthenticated, isActive, isLoading, login, totalSlots } = usePatronAuth();
  // An inactive membership can still hold prioritized account slots (e.g. a slot override).
  const hasSlots = isActive || totalSlots > 0;

  const accountsQuery = useQuery({
    ...steamAccountsQueryOptions(),
    enabled: !IS_DEV && isAuthenticated && hasSlots,
  });

  // Patreon OAuth is unavailable against localhost, so the gate would make the page untestable in dev.
  if (IS_DEV) return children;

  if (isLoading || (isAuthenticated && hasSlots && accountsQuery.isPending)) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingLogo />
      </div>
    );
  }

  if (!isAuthenticated || !hasSlots) {
    return (
      <GateCard icon={<Lock className="size-6 text-primary" />} title="The player tracker is a patron feature">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Full match history, rank progression, hero breakdowns, and mate &amp; opponent analytics are available for the
          prioritized Steam accounts linked to your Patreon subscription.
        </p>
        {isAuthenticated && (
          <p className="text-sm text-muted-foreground">
            Your Patreon membership is currently inactive. Reactivate it to regain access.
          </p>
        )}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button onClick={login}>Sign in with Patreon</Button>
          <Button variant="outline" asChild>
            <Link to="/patron">Learn more</Link>
          </Button>
        </div>
      </GateCard>
    );
  }

  const isOwnAccount = accountsQuery.data?.accounts.some((account) => account.steam_id3 === accountId) ?? false;
  if (!isOwnAccount) {
    return (
      <GateCard icon={<ShieldX className="size-6 text-primary" />} title="Not one of your prioritized accounts">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The tracker is only available for Steam accounts linked to your Patreon subscription. Add this account on the
          Prioritized Fetching page to track it.
        </p>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button asChild>
            <Link to="/patron">Manage accounts</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/tracker">Your accounts</Link>
          </Button>
        </div>
      </GateCard>
    );
  }

  return children;
}
