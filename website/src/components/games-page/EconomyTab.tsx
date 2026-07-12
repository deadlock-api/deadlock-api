import type {
  AnalyticsApiGameStatsRequest,
  AnalyticsApiPlayerPerformanceCurveRequest,
  PlayerPerformanceCurveGameModeEnum,
} from "deadlock_api_client";
import { Coins, TrendingUp, Trophy } from "lucide-react";

import EconomyGrowthCurve from "./EconomyGrowthCurve";
import EconomySoulSources from "./EconomySoulSources";
import EconomySourcesByRank from "./EconomySourcesByRank";

interface EconomyTabProps {
  params: AnalyticsApiGameStatsRequest;
  isStreetBrawl?: boolean;
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Coins;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-start gap-3 border-b border-white/[0.06] bg-white/[0.015] px-4 py-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary/80" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center p-4">{children}</div>
    </section>
  );
}

export default function EconomyTab({ params, isStreetBrawl = false }: EconomyTabProps) {
  if (isStreetBrawl) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Soul economy isn&apos;t tracked in Street Brawl. Pick a standard game mode to explore economy stats.
      </div>
    );
  }

  const perfParams: AnalyticsApiPlayerPerformanceCurveRequest = {
    gameMode: params.gameMode as PlayerPerformanceCurveGameModeEnum | undefined,
    minUnixTimestamp: params.minUnixTimestamp,
    maxUnixTimestamp: params.maxUnixTimestamp,
    minDurationS: params.minDurationS,
    maxDurationS: params.maxDurationS,
    minAverageBadge: params.minAverageBadge,
    maxAverageBadge: params.maxAverageBadge,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <Section
          icon={Coins}
          title="Where Souls Come From"
          description="Average soul income per player, split by source. Orbs are counted with their source."
        >
          <EconomySoulSources params={params} />
        </Section>

        <Section
          icon={Trophy}
          title="Soul Sources by Rank"
          description="How the soul economy shifts across skill tiers — toggle between each source's share and raw souls."
        >
          <EconomySourcesByRank params={params} />
        </Section>
      </div>

      <Section
        icon={TrendingUp}
        title="Net Worth Growth"
        description="How the average player's net worth grows from early to late game. Shaded band shows ±1 standard deviation."
      >
        <EconomyGrowthCurve params={perfParams} />
      </Section>
    </div>
  );
}
