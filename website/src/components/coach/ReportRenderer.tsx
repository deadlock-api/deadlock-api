import { CoachIcon } from "~/lib/coach/icons";
import type { Block, Report } from "~/lib/coach/report";
import { cn } from "~/lib/utils";

import { AreaChart, BarChart, LineChart, NetWorthChart, RadarChart, WinProbabilityChart } from "./Charts";
import { AbilityOrder, Comparison, HeroCard, ItemBuild, KeyValue, Scoreboard, StatCards, Timeline } from "./DataBlocks";
import { MatchReplay } from "./MatchReplay";
import { Minimap } from "./Minimap";
import { Callout, Header, MarkdownProse } from "./TextBlocks";

export function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "header":
      return <Header block={block} />;
    case "section":
      return (
        <section className="space-y-3">
          {(block.title || block.subtitle) && (
            <div className="flex items-center gap-2">
              {block.icon ? <CoachIcon name={block.icon} className="size-4 text-primary" /> : null}
              <div>
                {block.title ? (
                  <h2 className="text-base font-semibold tracking-tight text-foreground">{block.title}</h2>
                ) : null}
                {block.subtitle ? <p className="text-xs text-muted-foreground">{block.subtitle}</p> : null}
              </div>
            </div>
          )}
          <BlockList blocks={block.children ?? []} />
        </section>
      );
    case "grid": {
      const cols = Math.min(Math.max(block.columns ?? 2, 1), 4);
      const colClass =
        cols === 1
          ? "grid-cols-1"
          : cols === 2
            ? "grid-cols-1 md:grid-cols-2"
            : cols === 3
              ? "grid-cols-1 md:grid-cols-3"
              : "grid-cols-1 md:grid-cols-2 xl:grid-cols-4";
      return (
        <div className={cn("grid gap-3", colClass)}>
          {(block.children ?? []).map((child, i) => (
            <RenderBlock key={i} block={child} />
          ))}
        </div>
      );
    }
    case "divider":
      return (
        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-white/[0.08]" />
          {block.label ? <span className="text-xs font-medium text-muted-foreground">{block.label}</span> : null}
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>
      );
    case "markdown":
      return <MarkdownProse block={block} />;
    case "callout":
      return <Callout block={block} />;
    case "stat_cards":
      return <StatCards block={block} />;
    case "key_value":
      return <KeyValue block={block} />;
    case "comparison":
      return <Comparison block={block} />;
    case "hero_card":
      return <HeroCard block={block} />;
    case "line_chart":
      return <LineChart block={block} />;
    case "area_chart":
      return <AreaChart block={block} />;
    case "bar_chart":
      return <BarChart block={block} />;
    case "radar_chart":
      return <RadarChart block={block} />;
    case "net_worth_chart":
      return <NetWorthChart block={block} />;
    case "win_probability_chart":
      return <WinProbabilityChart block={block} />;
    case "timeline":
      return <Timeline block={block} />;
    case "scoreboard":
      return <Scoreboard block={block} />;
    case "item_build":
      return <ItemBuild block={block} />;
    case "ability_order":
      return <AbilityOrder block={block} />;
    case "minimap":
      return <Minimap block={block} />;
    case "match_replay":
      return <MatchReplay block={block} />;
    default:
      return null;
  }
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <RenderBlock key={i} block={block} />
      ))}
    </div>
  );
}

export function ReportRenderer({ report }: { report: Report }) {
  return (
    <div className="space-y-4">
      <BlockList blocks={report.blocks} />
    </div>
  );
}
