import { ArrowRight, CheckCircle, LogIn } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

function ComparisonRow({ label, free, checked }: { label: string; free?: boolean; checked?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_140px_140px] border-t border-border">
      <div className="p-3 px-4 text-sm">{label}</div>
      <div className="p-3 flex items-center justify-center border-l border-border">
        {free ? (
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>
      <div className="p-3 flex items-center justify-center border-l border-primary/30 bg-primary/5">
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
      <section className="relative text-center space-y-6 py-8">
        {/* Glow effect behind hero */}
        <div className="absolute inset-0 -top-12 flex items-center justify-center pointer-events-none" aria-hidden>
          <div className="w-80 h-80 rounded-full bg-primary/8 blur-3xl" />
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8"
              onClick={onLogin}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign in with Patreon
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Become a Patron
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Starting at $3/month — every cent goes to infrastructure</p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="max-w-2xl mx-auto">
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_140px_140px] bg-muted/40">
            <div className="p-4" />
            <div className="p-4 text-center text-sm font-medium text-muted-foreground border-l border-border">Free</div>
            <div className="p-4 text-center text-sm font-semibold text-primary border-l border-primary/30 bg-primary/5">
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
        <p className="text-muted-foreground mt-1">You're signed in but don't have an active subscription yet.</p>
      </div>

      <Card className="border-primary/30 bg-linear-to-br from-primary/10 to-primary/5">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
            <ArrowRight className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Get prioritized fetching</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Subscribe on Patreon to unlock dedicated queue access with reserved resources. Your match data and stats
              will be fetched faster and more reliably, and upstreamed to Statlocker, Tracklock, Lockblaze, or your
              favorite stat tracking site.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button
              size="lg"
              asChild
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8"
            >
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Subscribe on Patreon
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">Starting at $3/month — every cent goes to infrastructure</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
