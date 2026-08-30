import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { IS_DEV } from "~/lib/constants";

export function TrackerGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isActive, isLoading, login, totalSlots } = usePatronAuth();

  // Patreon OAuth is unavailable against localhost, so the gate would make the page untestable in dev.
  if (IS_DEV) return children;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingLogo />
      </div>
    );
  }

  // An inactive membership can still hold prioritized account slots (e.g. a slot override).
  if (isAuthenticated && (isActive || totalSlots > 0)) {
    return children;
  }

  return (
    <div className="mx-auto max-w-xl py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="size-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">The player tracker is a patron feature</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Full match history, rank progression, hero breakdowns, and mate &amp; opponent analytics are available to
            Patreon supporters with prioritized Steam accounts.
          </p>
          {isAuthenticated && !isActive && (
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
        </CardContent>
      </Card>
    </div>
  );
}
