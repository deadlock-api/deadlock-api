import { TrendingDown, TrendingUp } from "lucide-react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { Insight } from "~/lib/tracker/insights";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

function InsightRow({ insight }: { insight: Insight }) {
  const good = insight.tone === "good";
  const Icon = good ? TrendingUp : TrendingDown;
  return (
    <div
      className="flex items-center gap-3"
      title="Win rate of this split, and how far it sits from your overall win rate"
    >
      {insight.heroId != null ? (
        <HeroImage heroId={insight.heroId} className="size-8 shrink-0 rounded-full" />
      ) : (
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            good ? "bg-emerald-500/10" : "bg-primary/10",
          )}
        >
          <Icon className={cn("size-4", good ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug font-medium">{insight.headline}</div>
        <div className="truncate text-xs text-muted-foreground">
          {insight.heroId != null && (
            <>
              <HeroName heroId={insight.heroId} /> ·{" "}
            </>
          )}
          {insight.detail}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={cn("text-lg leading-tight font-semibold tabular-nums", good ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}
        >
          {insight.value}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">{insight.delta}</div>
      </div>
    </div>
  );
}

export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What stands out</CardTitle>
        <CardDescription>The splits furthest from your overall win rate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing stands out yet — your win rate holds steady across heroes, game lengths and sessions.
          </p>
        ) : (
          insights.map((insight) => <InsightRow key={insight.id} insight={insight} />)
        )}
      </CardContent>
    </Card>
  );
}
