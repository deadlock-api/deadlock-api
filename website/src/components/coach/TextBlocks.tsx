import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { HeroImage } from "~/components/HeroImage";
import { CoachIcon } from "~/lib/coach/icons";
import type { CalloutBlock, HeaderBlock, MarkdownBlock } from "~/lib/coach/report";
import { toneColor, toneSurface } from "~/lib/coach/tones";
import { cn } from "~/lib/utils";

import { EvidenceChip } from "./shared";

export function Header({ block }: { block: HeaderBlock }) {
  const accent = toneColor(block.verdict_tone ?? "accent");
  return (
    <header className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent p-6">
      <div
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full blur-3xl"
        style={{ backgroundColor: toneColor(block.verdict_tone ?? "accent"), opacity: 0.12 }}
      />
      <div className="relative flex items-start gap-4">
        {block.hero_id != null ? (
          <div className="shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <HeroImage heroId={block.hero_id} className="size-16" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {block.verdict ? (
            <div
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              style={toneSurface(block.verdict_tone ?? "accent")}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />
              {block.verdict}
            </div>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{block.title}</h1>
          {block.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{block.subtitle}</p> : null}
          {block.chips && block.chips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {block.chips.map((chip) => (
                <div
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
                  style={toneSurface(chip.tone ?? "neutral", 0.8)}
                >
                  {chip.icon ? <CoachIcon name={chip.icon} className="size-3.5" /> : null}
                  <span className="text-muted-foreground">{chip.label}</span>
                  <span className="font-semibold text-foreground">{chip.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function Callout({ block }: { block: CalloutBlock }) {
  const tone = block.tone ?? "info";
  const color = toneColor(tone);
  const icon = block.icon ?? defaultCalloutIcon(tone);
  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-white/[0.02] p-4"
      style={{ borderColor: `${color}33` }}
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
      <div className="flex gap-3 pl-2">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <CoachIcon name={icon} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          {block.title ? <p className="text-sm font-semibold text-foreground">{block.title}</p> : null}
          <div className={cn("text-sm text-muted-foreground", block.title && "mt-0.5")}>
            <Markdown remarkPlugins={[remarkGfm]}>{block.body}</Markdown>
          </div>
          {block.evidence ? <EvidenceChip evidence={block.evidence} /> : null}
        </div>
      </div>
    </div>
  );
}

function defaultCalloutIcon(tone: string): string {
  switch (tone) {
    case "success":
      return "check";
    case "warning":
      return "warning";
    case "critical":
      return "alert";
    case "tip":
      return "tip";
    default:
      return "info";
  }
}

export function MarkdownProse({ block }: { block: MarkdownBlock }) {
  return (
    <div className="prose prose-sm max-w-none prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-muted-foreground">
      <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
    </div>
  );
}
