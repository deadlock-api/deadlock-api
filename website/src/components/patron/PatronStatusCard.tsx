import { AlertCircle, ArrowRight, CheckCircle, Clock, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { formatCurrency, formatDate } from "~/lib/format";
import { usePatronStatus } from "~/queries/patron-queries";

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
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-40" />
          </div>
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
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading patron status</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Failed to load patron status"}</AlertDescription>
      </Alert>
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
  const canUpgrade = total_slots < 10;
  const slotPercentage = total_slots > 0 ? (usedSlots / total_slots) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Patron Status
            {is_active ? (
              <Badge className="bg-green-600 hover:bg-green-600">
                <CheckCircle className="mr-1 h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="mr-1 h-3 w-3" />
                Inactive
              </Badge>
            )}
          </CardTitle>
        </div>
        <CardDescription>
          {pledge_amount_cents ? `Pledging ${formatCurrency(pledge_amount_cents)} / month` : "No active pledge"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Pledge</p>
            <p className="text-2xl font-bold">{pledge_amount_cents ? formatCurrency(pledge_amount_cents) : "—"}</p>
            <p className="text-xs text-muted-foreground">per month</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Last Verified</p>
            <p className="text-lg font-semibold">{formatDate(last_verified_at)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Account Slots</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{usedSlots}</p>
              <p className="text-sm text-muted-foreground">of {total_slots} used</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${slotPercentage}%` }}
              />
            </div>
            {cooldown_count > 0 && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {cooldown_count} in cooldown
              </p>
            )}
          </div>
        </div>
        {available_slots === 0 && canUpgrade && (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 to-primary/5 p-6 text-center">
            <p className="text-base font-medium">Want to prioritize more accounts?</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Each additional $1.50/month unlocks another slot. You can add up to {50 - total_slots} more.
            </p>
            <Button size="lg" asChild className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Increase Pledge
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
