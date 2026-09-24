import type { AnalyticsApiGameStatsRequest, AnalyticsApiPlayerPerformanceCurveRequest } from "deadlock_api_client";
import { Coins, type LucideIcon, TrendingUp, Trophy } from "lucide-react";

import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";

import EconomyGrowthCurve from "./EconomyGrowthCurve";
import EconomySoulSources from "./EconomySoulSources";
import EconomySourcesByRank from "./EconomySourcesByRank";

interface EconomyTabProps {
  params: AnalyticsApiGameStatsRequest;
  isStreetBrawl?: boolean;
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="h-full">
      <PanelHeader title={title} icon={icon} />
      <PanelBody className="flex flex-1 flex-col justify-center">{children}</PanelBody>
      <PanelFooter>{description}</PanelFooter>
    </Panel>
  );
}

export default function EconomyTab({ params, isStreetBrawl = false }: EconomyTabProps) {
  if (isStreetBrawl) {
    return (
      <EmptyState
        title="Soul economy isn't tracked in Street Brawl."
        description="Pick a standard game mode to explore economy stats."
      />
    );
  }

  const perfParams: AnalyticsApiPlayerPerformanceCurveRequest = {
    gameMode: params.gameMode,
    matchMode: params.matchMode,
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
          description="How the soul economy shifts across skill tiers. Toggle between each source's share and raw souls."
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
