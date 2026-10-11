import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Lock, ShieldX } from "lucide-react";

import { InstallButton } from "~/components/domain/ingest/InstallButton";
import { INGEST_INSTALL_PATH, INGEST_TRACKER_WINDOW_DAYS } from "~/components/domain/ingest/links";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { IconTile } from "~/components/ui/icon-tile";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { IS_DEV } from "~/lib/constants";
import { steamAccountsQueryOptions } from "~/queries/patron-queries";
import { trackerIngestStatusQueryOptions } from "~/queries/tracker-queries";

function GateCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <IconTile shape="circle" size="lg" tone="primary">
            {icon}
          </IconTile>
          <Heading as="h2" size="2xl">
            {title}
          </Heading>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function TrackerGate({ accountId, children }: { accountId: number; children: React.ReactNode }) {
  const {
    isAuthenticated,
    isActive,
    isLoading,
    isResolved,
    statusError,
    isRefreshingStatus,
    refreshStatus,
    login,
    totalSlots,
  } = usePatronAuth();
  // An inactive membership can still hold prioritized account slots (e.g. a slot override).
  const hasSlots = isActive || totalSlots > 0;

  const accountsQuery = useQuery({
    ...steamAccountsQueryOptions(),
    enabled: !IS_DEV && isAuthenticated && hasSlots,
  });

  // Running the ingest tool opens the account's tracker for anyone, signed in or not.
  const ingestQuery = useQuery({ ...trackerIngestStatusQueryOptions(accountId), enabled: !IS_DEV });

  // Patreon OAuth is unavailable against localhost, so the gate would make the page untestable in dev.
  if (IS_DEV) return children;

  if (ingestQuery.data?.active) return children;

  // Until both answer, a visitor would see the sign-in gate flash before the profile. A failed ingest check falls back
  // to the Patreon gate rather than blocking it.
  if (ingestQuery.isPending || isLoading || !isResolved || (isAuthenticated && hasSlots && accountsQuery.isPending)) {
    return <LoadingState label="player tracker" align="center" />;
  }

  // An outage is not a sign-out: offer a retry rather than the sign-in gate.
  if (statusError) {
    return (
      <div className="mx-auto w-full max-w-xl py-16">
        <ErrorState
          title="Could not check your sign-in"
          description="The Patreon status is temporarily unavailable. Try again in a moment."
          onRetry={() => void refreshStatus()}
          retrying={isRefreshingStatus}
        />
      </div>
    );
  }

  if (!isAuthenticated || !hasSlots) {
    return (
      <GateCard icon={<Lock />} title="Unlock the player tracker">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Full match history, rank progression, hero breakdowns, and mate &amp; opponent analytics. Free for every
          account that sent its matches with the ingest tool in the last {INGEST_TRACKER_WINDOW_DAYS} days, and for the
          prioritized Steam accounts linked to your Patreon subscription.
        </p>
        {isAuthenticated && (
          <p className="text-sm text-muted-foreground">
            Your Patreon membership is currently inactive. Reactivate it to regain access.
          </p>
        )}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <InstallButton size="default" installHref={INGEST_INSTALL_PATH} />
          <Button variant="secondary" asChild>
            <Link to="/patron">Get Patreon</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/tracker/demo">View demo profile</Link>
          </Button>
        </div>
        {!isAuthenticated && (
          <p className="text-sm text-muted-foreground">
            Already a patron?{" "}
            <Button variant="link" size="inline" onClick={login}>
              Sign in with Patreon
            </Button>
          </p>
        )}
      </GateCard>
    );
  }

  const isOwnAccount =
    accountsQuery.data?.accounts.some((account) => account.steam_id3 === accountId && account.deleted_at === null) ??
    false;
  if (accountsQuery.isError && !isOwnAccount) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorState
          title="Could not check your accounts"
          description="We could not load your prioritized accounts. Try again to open this player's tracker."
          onRetry={() => accountsQuery.refetch()}
          retrying={accountsQuery.isFetching}
        />
      </div>
    );
  }

  if (!isOwnAccount) {
    return (
      <GateCard icon={<ShieldX />} title="Not one of your prioritized accounts">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The tracker opens for Steam accounts linked to your Patreon subscription, and for every account that sent its
          matches with the ingest tool in the last {INGEST_TRACKER_WINDOW_DAYS} days. Add this account on the
          Prioritized Fetching page, or run the tool on it.
        </p>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button asChild>
            <Link to="/patron">Manage accounts</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/ingest-cache">Run the ingest tool</Link>
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
