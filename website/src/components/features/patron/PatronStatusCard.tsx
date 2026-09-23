import { AlertCircle, ArrowRight, CheckCircle, Clock, XCircle } from "lucide-react";

import { CalloutCard } from "~/components/patterns/content/CalloutCard";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { formatCurrency, formatDate } from "~/lib/format";
import { usePatronStatus } from "~/queries/patron-queries";

/** The API caps a pledge at 50 prioritized accounts (`calculate_slot_limit`). */
const MAX_SLOTS = 50;

function PatronStatusCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <Stack gap={1}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-24" />
          </Stack>
          <Stack gap={1}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
          </Stack>
          <Stack gap={1}>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-40" />
          </Stack>
        </div>
      </CardContent>
    </Card>
  );
}

export function PatronStatusCard() {
  const query = usePatronStatus();
  const status = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;
  const error = query.error;

  if (isLoading) {
    return <PatronStatusCardSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Error loading patron status"
        description={error instanceof Error ? error.message : "Failed to load patron status"}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!status) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Session expired</AlertTitle>
        <AlertDescription>Please log in again to view your patron status.</AlertDescription>
      </Alert>
    );
  }

  const { is_active, pledge_amount_cents, last_verified_at, steam_accounts_summary, total_slots } = status;
  const { active_count, cooldown_count, available_slots } = steam_accounts_summary;
  const usedSlots = active_count + cooldown_count;
  const canUpgrade = total_slots < MAX_SLOTS;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Patron Status
            {is_active ? (
              <Badge variant="positive">
                <CheckCircle />
                Active
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle />
                Inactive
              </Badge>
            )}
          </CardTitle>
        </div>
        <CardDescription>
          {pledge_amount_cents ? `Pledging ${formatCurrency(pledge_amount_cents)} / month` : "No active pledge"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <StatGroup variant="plain" size="sm" className="gap-4 md:grid-cols-3">
          <Stat
            label="Pledge"
            value={pledge_amount_cents ? formatCurrency(pledge_amount_cents) : "—"}
            sub="per month"
          />
          <Stat label="Last Verified" value={formatDate(last_verified_at)} />
          <Stat
            label="Account Slots"
            value={usedSlots}
            sub={
              <Stack gap={1.5}>
                of {total_slots} used
                <ProgressBar
                  value={usedSlots}
                  max={total_slots}
                  aria-label={`${usedSlots} of ${total_slots} account slots used`}
                />
                {cooldown_count > 0 && (
                  <Inline gap={1} wrap="nowrap">
                    <Clock className="size-3" />
                    {cooldown_count} in cooldown
                  </Inline>
                )}
              </Stack>
            }
          />
        </StatGroup>
        {available_slots === 0 && canUpgrade && (
          <CalloutCard
            as="h3"
            title="Want to prioritize more accounts?"
            description={`Each additional $1.50/month unlocks another slot. You can add up to ${MAX_SLOTS - total_slots} more.`}
            action={
              <Button size="lg" asChild>
                <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                  Increase Pledge
                  <ArrowRight />
                </a>
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
