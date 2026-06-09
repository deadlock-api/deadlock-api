import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  LineChart,
  LogIn,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { usePatronAuth } from "~/hooks/usePatronAuth";

export function ComingSoonTeaser() {
  const { isAuthenticated, isLoading, login } = usePatronAuth();

  return (
    <div className="relative flex min-h-[85vh] w-full flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-1/3 bottom-0 size-[400px] rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div className="space-y-6 text-center">
          <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-primary">
            <Sparkles className="size-3.5" />
            Coming Soon
          </Badge>

          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-3xl bg-primary/20 blur-xl" />
              <div className="relative flex size-20 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 backdrop-blur">
                <Bot className="size-10 text-primary" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Deadlock <span className="text-primary">AI Agent</span>
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              An intelligent assistant that turns raw match data into actionable insight. Ask questions in plain
              language and get interactive charts, deep statistics, and tactical breakdowns, all powered by the Deadlock
              API.
            </p>
          </div>

          {!isLoading && !isAuthenticated && (
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={login}
                size="lg"
                className="bg-gradient-to-r from-[#fa4454] to-[#ff6b7a] font-semibold text-white hover:from-[#e83d4c] hover:to-[#f05a68]"
              >
                <LogIn className="mr-2 size-4" />
                Login with Patreon
              </Button>
              <p className="text-xs text-muted-foreground">
                The AI Coach is available to patrons pledging $3/month or more.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TeaserCard
            icon={<MessageSquare className="size-5" />}
            title="Conversational Analysis"
            description="Ask anything about heroes, items, builds, or matchups and get answers grounded in live data."
          />
          <TeaserCard
            icon={<BarChart3 className="size-5" />}
            title="Interactive Charts"
            description="Win-rate curves, item timing distributions, and net worth graphs generated on demand."
          />
          <TeaserCard
            icon={<Activity className="size-5" />}
            title="Deep Match Analytics"
            description="Lane-by-lane breakdowns, objective control, and team-fight participation pulled per match."
          />
          <TeaserCard
            icon={<TrendingUp className="size-5" />}
            title="Meta Trends"
            description="Track how the meta shifts across patches with hero pick rates, item builds, and win deltas."
          />
          <TeaserCard
            icon={<Brain className="size-5" />}
            title="Build Recommendations"
            description="Personalized item paths tuned to your hero, role, and the enemy team composition."
          />
          <TeaserCard
            icon={<Zap className="size-5" />}
            title="Live Insight"
            description="Powered directly by the public Deadlock API. Every answer is backed by real match data."
          />
        </div>

        <div className="mx-auto max-w-3xl">
          <Card className="border-dashed border-primary/30 bg-card/50 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LineChart className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">A preview of what's coming</h3>
                <p className="text-sm text-muted-foreground">
                  Imagine asking{" "}
                  <span className="text-foreground">"How did I play in this match, what were my mistakes?"</span> and
                  getting a lane-by-lane breakdown, item timing comparisons against the average, and the moments that
                  decided the game. That's the goal.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Want early access or have feedback on what the agent should answer first? Reach out on Discord.
        </p>
      </div>
    </div>
  );
}

function TeaserCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="group relative overflow-hidden border-border/60 bg-card/50 p-5 backdrop-blur transition hover:border-primary/40 hover:bg-card">
      <div className="space-y-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:scale-110">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </Card>
  );
}
