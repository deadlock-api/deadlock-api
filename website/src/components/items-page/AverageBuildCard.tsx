import { useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { ItemImage } from "~/components/ItemImage";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { AverageBuild, AverageBuildItem, BuildPhase, BuildVariant, TimelineEntry } from "~/lib/average-build";
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
  return (
    <span className={cn("font-semibold", wr >= 0.5 ? "text-green-500" : "text-primary", className)}>
      {Math.round(wr * 100)}% WR
    </span>
  );
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ItemIcon({ item, dim, badge }: { item: AverageBuildItem; dim?: boolean; badge?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <ItemImage itemId={item.itemId} className={cn("size-7 rounded-sm", dim && "opacity-60")} />
          <div className="pointer-events-none absolute right-0 bottom-0 z-10 rounded-tl-sm rounded-br-sm bg-black/85 px-0.5 text-[8px] leading-tight font-bold text-white">
            {badge ?? pct(item.frequency)}
          </div>
          {item.sellOrder != null && (
            <div className="pointer-events-none absolute top-0 left-0 z-10 flex size-3.5 items-center justify-center rounded-tl-sm rounded-br-sm bg-red-600 text-[9px] leading-none font-bold text-white">
              {item.sellOrder}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-xs">
          <div>
            In {item.count} game{item.count === 1 ? "" : "s"} ({pct(item.frequency)})
          </div>
          <div className="text-muted-foreground">typically ~{fmtTime(item.medianTimeS)}</div>
          {item.sellOrder != null && (
            <div className="text-red-400">
              Usually sold {item.sellOrder === 1 ? "first" : item.sellOrder === 2 ? "second" : "third"} when
              slot-crunched ({pct(item.soldRate)} of games)
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function FlexSlot({ entry }: { entry: Extract<TimelineEntry, { kind: "flex" }> }) {
  return (
    <div className="-mt-[5px] flex flex-col items-center gap-0.5 rounded-md border border-dashed border-amber-400/40 bg-amber-400/[0.05] px-1.5 py-1">
      <div className="flex items-center gap-1">
        {entry.candidates.map((candidate, i) => (
          <div key={candidate.itemId} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-amber-400/60">/</span>}
            <ItemIcon item={candidate} dim={i > 0} />
          </div>
        ))}
      </div>
      <span className="text-[8px] font-semibold tracking-wider text-amber-400/80 uppercase">
        1 of · {pct(entry.slotFrequency)}
      </span>
    </div>
  );
}

function EntryView({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "flex") return <FlexSlot entry={entry} />;
  return <ItemIcon item={entry.item} dim={entry.kind === "common"} />;
}

function PhaseRow({ label, entries }: { label: string; entries: TimelineEntry[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">{label}</span>
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
          <span className="text-[10px] text-muted-foreground/40 italic">—</span>
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
        <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">Situational</span>
          <div className="flex flex-wrap items-start gap-1.5">
            {variant.optionals.map((item) => (
              <ItemIcon key={item.itemId} item={item} dim />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-foreground/70" /> core
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-foreground/30" /> common
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm border border-dashed border-amber-400/70" /> flex
      </span>
      <span className="flex items-center gap-1">
        <span className="flex size-2.5 items-center justify-center rounded-sm bg-red-600 text-[7px] font-bold text-white">
          1
        </span>{" "}
        sell order
      </span>
    </div>
  );
}

export function AverageBuildCard({ build, heroId }: { build: AverageBuild; heroId: number }) {
  const [selectedId, setSelectedId] = useState(build.variants[0]?.id);
  const multi = build.variants.length > 1;
  const selected = build.variants.find((v) => v.id === selectedId) ?? build.variants[0];
  if (!selected) return null;

  return (
    <div className="flex w-full flex-col gap-3 rounded-md border-l-[6px] border-amber-400 bg-card p-3 text-sm shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HeroImage heroId={heroId} className="size-8 shrink-0 rounded-md border border-border/50" />
          <div className="flex flex-col">
            <span className="font-bold text-foreground">Average Build</span>
            <span className="text-[11px] text-muted-foreground">
              from {build.nBuilds} recent game{build.nBuilds === 1 ? "" : "s"} ·{" "}
              <WinRate wins={build.wins} games={build.nBuilds} className="text-[11px]" />
              {multi ? ` · ${build.variants.length} variants` : ""}
            </span>
          </div>
        </div>
        <Legend />
      </div>

      {multi && (
        <div className="flex flex-wrap gap-1.5">
          {build.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => setSelectedId(variant.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                variant.id === selected.id
                  ? "border-amber-400/60 bg-amber-400/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:bg-white/[0.04]",
              )}
            >
              <span className="font-semibold">Build {variant.id}</span>
              <span className="text-[10px] text-muted-foreground/80">
                {variant.nGames}g · {Math.round(variant.frequency * 100)}%
              </span>
              <WinRate wins={variant.wins} games={variant.nGames} className="text-[10px]" />
            </button>
          ))}
        </div>
      )}

      <VariantBody variant={selected} />
    </div>
  );
}
