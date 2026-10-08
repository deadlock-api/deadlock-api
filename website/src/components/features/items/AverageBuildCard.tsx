import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { CornerBadge } from "~/components/ui/corner-badge";
import { NoValue } from "~/components/ui/no-value";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { Tooltip } from "~/components/ui/tooltip";
import type { AverageBuild, AverageBuildItem, BuildPhase, BuildVariant, TimelineEntry } from "~/lib/average-build";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";

const PHASES: { key: BuildPhase; label: string }[] = [
  { key: "early", label: "Early" },
  { key: "mid", label: "Mid" },
  { key: "late", label: "Late" },
];

function pct(frequency: number): string {
  return `${Math.round(frequency * 100)}%`;
}

function WinRate({ wins, games, className }: { wins: number; games: number; className?: string }) {
  if (games === 0) return null;
  const wr = wins / games;
  return <span className={cn("font-semibold", TONE_TEXT[toneOf(wr, 0.5)], className)}>{Math.round(wr * 100)}% WR</span>;
}

function fmtTime(s: number): string {
  const whole = Math.round(s);
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ItemIcon({ item, dim, badge }: { item: AverageBuildItem; dim?: boolean; badge?: string }) {
  return (
    <Tooltip
      side="top"
      content={
        <>
          <div>
            In {item.count} game{item.count === 1 ? "" : "s"} ({pct(item.frequency)})
          </div>
          <div className="text-muted-foreground">typically ~{fmtTime(item.medianTimeS)}</div>
          {item.sellOrder != null && (
            <div className="text-negative">
              Usually sold {item.sellOrder === 1 ? "first" : item.sellOrder === 2 ? "second" : "third"} when
              slot-crunched ({pct(item.soldRate)} of games)
            </div>
          )}
        </>
      }
    >
      <div className="relative">
        <ItemImage itemId={item.itemId} emphasis={dim ? "dim" : "normal"} className="size-7" />
        <CornerBadge corner="bottom-end" tone="scrim" className="inset-e-0 bottom-0 z-10">
          {badge ?? pct(item.frequency)}
        </CornerBadge>
        {item.sellOrder != null && (
          <CornerBadge corner="top-start" className="inset-s-0 top-0 z-10 text-negative">
            {item.sellOrder}
          </CornerBadge>
        )}
      </div>
    </Tooltip>
  );
}

function FlexSlot({ entry }: { entry: Extract<TimelineEntry, { kind: "flex" }> }) {
  return (
    <Card tone="warning" size="xs" radius="md" className="items-center gap-0.5 px-1.5 py-1">
      <div className="flex items-center gap-1">
        {entry.candidates.map((candidate, i) => (
          <div key={candidate.itemId} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-warning">/</span>}
            <ItemIcon item={candidate} dim={i > 0} />
          </div>
        ))}
      </div>
      <Text variant="eyebrow" tone="warning">
        1 of · {pct(entry.slotFrequency)}
      </Text>
    </Card>
  );
}

function EntryView({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "flex") return <FlexSlot entry={entry} />;
  return <ItemIcon item={entry.item} dim={entry.kind === "common"} />;
}

function PhaseRow({ label, entries }: { label: string; entries: TimelineEntry[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <div className="flex flex-wrap items-start gap-1.5">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <EntryView
              key={
                entry.kind === "flex" ? `flex-${entry.candidates.map((c) => c.itemId).join("-")}` : entry.item.itemId
              }
              entry={entry}
            />
          ))
        ) : (
          <NoValue label="No items" className="text-xs" />
        )}
      </div>
    </div>
  );
}

function VariantBody({ variant }: { variant: BuildVariant }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        {PHASES.map(({ key, label }) => (
          <PhaseRow key={key} label={label} entries={variant.phases[key]} />
        ))}
      </div>

      {variant.optionals.length > 0 && (
        <Stack gap={2}>
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Situational</span>
            <div className="flex flex-wrap items-start gap-1.5">
              {variant.optionals.map((item) => (
                <ItemIcon key={item.itemId} item={item} dim />
              ))}
            </div>
          </div>
        </Stack>
      )}
    </>
  );
}

function Legend() {
  return (
    <ChartLegend size="sm" label="Build legend">
      <ChartLegendItem color={CHART_COLOR.ink}>core</ChartLegendItem>
      <ChartLegendItem color={CHART_COLOR.neutral}>common</ChartLegendItem>
      <ChartLegendItem color={CHART_COLOR.caution} shape="ring">
        flex
      </ChartLegendItem>
      <ChartLegendItem
        color={CHART_COLOR.negative}
        icon={
          <Badge variant="negative" size="sm" shape="circle" aria-hidden="true">
            1
          </Badge>
        }
      >
        sell order
      </ChartLegendItem>
    </ChartLegend>
  );
}

export function AverageBuildCard({ build, heroId }: { build: AverageBuild; heroId: number }) {
  const [selectedId, setSelectedId] = useState(build.variants[0]?.id);
  const multi = build.variants.length > 1;
  const selected = build.variants.find((v) => v.id === selectedId) ?? build.variants[0];
  if (!selected) return null;

  return (
    <Card size="sm" accent={CHART_COLOR.caution} className="w-full px-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HeroImage heroId={heroId} shape="rounded" ring="border" className="size-8 shrink-0" />
          <div className="flex flex-col">
            <span className="font-bold text-foreground">Average Build</span>
            <span className="text-xs text-muted-foreground">
              from {build.nBuilds} recent game{build.nBuilds === 1 ? "" : "s"} ·{" "}
              <WinRate wins={build.wins} games={build.nBuilds} className="text-xs" />
              {multi ? ` · ${build.variants.length} variants` : ""}
            </span>
          </div>
        </div>
        <Legend />
      </div>

      {multi && (
        <Segmented aria-label="Build variant" size="lg" width="hug" value={selected.id} onValueChange={setSelectedId}>
          {build.variants.map((variant) => (
            <SegmentedItem key={variant.id} value={variant.id}>
              <span className="font-semibold">Build {variant.id}</span>
              <span className="text-xs text-muted-foreground">
                {variant.nGames}g · {Math.round(variant.frequency * 100)}%
              </span>
              <WinRate wins={variant.wins} games={variant.nGames} className="text-xs" />
            </SegmentedItem>
          ))}
        </Segmented>
      )}

      <VariantBody variant={selected} />
    </Card>
  );
}
