import { ArrowRight, CheckCircle, LogIn } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

function ComparisonRow({ label, free, checked }: { label: string; free?: boolean; checked?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px] border-t border-border sm:grid-cols-[1fr_140px_140px]">
      <div className="p-3 px-4 text-sm">{label}</div>
      <div className="flex items-center justify-center border-l border-border p-3">
        {free ? (
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>
      <div className="flex items-center justify-center border-l border-primary/30 bg-primary/5 p-3">
        {checked ? (
          <CheckCircle className="h-4 w-4 text-primary" />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>
    </div>
  );
}

export function UnauthenticatedState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="space-y-4">
      {/* Hero Section */}
      <section className="relative space-y-6 py-8 text-center">
        {/* Glow effect behind hero */}
        <div className="pointer-events-none absolute inset-0 -top-12 flex items-center justify-center" aria-hidden>
          <div className="h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
            Your matches. Updated <span className="text-primary">faster</span>.
          </h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Patron accounts get a dedicated queue with reserved resources, guaranteeing fast and reliable data fetching
            for your match history and stats. Data is upstreamed to Statlocker, Tracklock, Lockblaze, or your favorite
            stat tracking site.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
            <Button
              size="lg"
              className="bg-primary px-8 font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={onLogin}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign in with Patreon
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Become a Patron
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Starting at $3/month — every cent goes to infrastructure</p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-xl border border-border">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_120px] bg-muted/40 sm:grid-cols-[1fr_140px_140px]">
            <div className="p-4" />
            <div className="border-l border-border p-4 text-center text-sm font-medium text-muted-foreground">Free</div>
            <div className="border-l border-primary/30 bg-primary/5 p-4 text-center text-sm font-semibold text-primary">
              Patron
            </div>
          </div>
          {/* Rows */}
          <ComparisonRow label="Full API access" free checked />
          <ComparisonRow label="Match history & stats" free checked />
          <ComparisonRow label="Dedicated queue with reserved resources" checked />
          <ComparisonRow label="Faster data updates" checked />
          <ComparisonRow label="Full match history from first to last game" checked />
          <ComparisonRow label="Up to 10 prioritized accounts" checked />
          <ComparisonRow label="Swap accounts anytime" checked />
          <ComparisonRow label="Accurate rank data from Steam" checked />
        </div>
      </section>
    </div>
  );
}

export function NotSubscribedState() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome, Patron!</h1>
        <p className="mt-1 text-muted-foreground">You're signed in but don't have an active subscription yet.</p>
      </div>

      <Card className="border-primary/30 bg-linear-to-br from-primary/10 to-primary/5">
        <CardContent className="space-y-4 pt-8 pb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <ArrowRight className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Get prioritized fetching</h2>
            <p className="mx-auto max-w-md text-muted-foreground">
              Subscribe on Patreon to unlock dedicated queue access with reserved resources. Your match data and stats
              will be fetched faster and more reliably, and upstreamed to Statlocker, Tracklock, Lockblaze, or your
              favorite stat tracking site.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button
              size="lg"
              asChild
              className="bg-primary px-8 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Subscribe on Patreon
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">Starting at $3/month — every cent goes to infrastructure</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
