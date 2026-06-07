import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { CoachIcon } from "~/lib/coach/icons";
import type {
  AbilityOrderBlock,
  AbilityOrderComparisonBlock,
  AbilityOrderRow,
  BuildColumn,
  HeroCardBlock,
  ItemBuildBlock,
  ItemComparisonBlock,
  KeyValueBlock,
  ScoreboardBlock,
  StatCard,
  StatCardsBlock,
  TimelineBlock,
} from "~/lib/coach/report";
import { hexAlpha, teamLabel, toneColor, toneSurface } from "~/lib/coach/tones";
import { cn } from "~/lib/utils";

import { BlockHeading, CoachCard, formatClock, Sparkline } from "./shared";

export function StatCards({ block }: { block: StatCardsBlock }) {
  const cols = Math.min(block.columns ?? block.cards.length, 6);
  return (
    <div>
      <BlockHeading title={block.title} />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cols > 3 ? 150 : 200}px), 1fr))` }}
      >
        {block.cards.map((card) => (
          <StatCardView key={card.label} card={card} />
        ))}
      </div>
    </div>
  );
}

function StatCardView({ card }: { card: StatCard }) {
  const tone = card.tone ?? "neutral";
  const color = toneColor(tone);
  const deltaGood = card.delta_is_good;
  const deltaColor = deltaGood == null ? "#8b949e" : deltaGood ? "#34d399" : "#fa4454";
  return (
    <CoachCard className="flex flex-col gap-1.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{card.label}</span>
        {card.icon ? (
          <span
            className="flex size-6 items-center justify-center rounded-md"
            style={{ backgroundColor: hexAlpha(color, 0.12), color }}
          >
            <CoachIcon name={card.icon} className="size-3.5" />
          </span>
        ) : null}
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{card.value}</span>
        {card.unit ? <span className="pb-1 text-xs text-muted-foreground">{card.unit}</span> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color: deltaColor }}>
          {card.delta ? (
            <>
              {card.delta_direction === "up" ? (
                <CoachIcon name="trending-up" className="size-3.5" />
              ) : card.delta_direction === "down" ? (
                <CoachIcon name="trending-down" className="size-3.5" />
              ) : null}
              {card.delta}
            </>
          ) : (
            <span className="text-muted-foreground">{card.hint}</span>
          )}
        </div>
        {card.sparkline && card.sparkline.length > 1 ? <Sparkline values={card.sparkline} tone={tone} /> : null}
      </div>
      {card.delta && card.hint ? <span className="text-[11px] text-muted-foreground">{card.hint}</span> : null}
    </CoachCard>
  );
}

export function KeyValue({ block }: { block: KeyValueBlock }) {
  return (
    <CoachCard>
      <BlockHeading title={block.title} />
      <dl className="divide-y divide-white/[0.05]">
        {block.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd
              className={cn("text-sm tabular-nums", row.emphasis ? "font-semibold" : "font-medium")}
              style={{ color: row.tone && row.tone !== "neutral" ? toneColor(row.tone) : undefined }}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </CoachCard>
  );
}

export function HeroCard({ block }: { block: HeroCardBlock }) {
  const color = toneColor(block.tone ?? "accent");
  return (
    <CoachCard className="overflow-hidden p-0">
      <div
        className="flex items-center gap-3 p-4"
        style={{ background: `linear-gradient(90deg, ${hexAlpha(color, 0.14)}, transparent)` }}
      >
        {block.hero_id != null ? (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
            <HeroImage heroId={block.hero_id} className="size-12" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {block.hero_name ?? (block.hero_id != null ? <HeroName heroId={block.hero_id} /> : "Hero")}
          </p>
          <p className="truncate text-xs text-muted-foreground">{block.role ?? block.subtitle}</p>
        </div>
      </div>
      {block.stats && block.stats.length > 0 ? (
        <div className="grid grid-cols-3 divide-x divide-white/[0.05] border-t border-white/[0.05]">
          {block.stats.slice(0, 3).map((s) => (
            <div key={s.label} className="px-3 py-2.5 text-center">
              <p className="text-base font-bold text-foreground tabular-nums">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      ) : null}
    </CoachCard>
  );
}

export function Scoreboard({ block }: { block: ScoreboardBlock }) {
  const teams = [0, 1] as const;
  return (
    <CoachCard className="overflow-hidden p-0">
      <div className="p-4 pb-2">
        <BlockHeading title={block.title} className="mb-0" />
      </div>
      <div className="overflow-x-auto pb-2">
        {teams.map((team) => {
          const players = block.players.filter((p) => (p.team ?? 0) === team);
          if (players.length === 0) return null;
          return (
            <div key={team} className="px-2">
              <p
                className="px-2 pt-3 pb-1 text-xs font-semibold"
                style={{ color: toneColor(team === 0 ? "team0" : "team1") }}
              >
                {teamLabel(team)}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-2 py-1 text-left font-medium">Player</th>
                    <th className="w-8 px-1 py-1 text-right font-medium">K</th>
                    <th className="w-8 px-1 py-1 text-right font-medium">D</th>
                    <th className="w-8 px-1 py-1 text-right font-medium">A</th>
                    <th className="w-20 px-2 py-1 text-right font-medium">Souls</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr
                      key={`${p.hero_id ?? p.name ?? "p"}-${p.kills}-${p.net_worth}`}
                      className={cn("border-t border-white/[0.04]", p.is_focus && "bg-primary/[0.07]")}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          {p.hero_id != null ? <HeroImage heroId={p.hero_id} className="size-6 rounded" /> : null}
                          <span className={cn("truncate", p.is_focus && "font-semibold text-primary")}>
                            {p.name ??
                              (p.hero_id != null ? <HeroName heroId={p.hero_id} /> : (p.hero_name ?? "Player"))}
                          </span>
                        </div>
                      </td>
                      <td className="px-1 py-2 text-right text-foreground tabular-nums">{p.kills ?? 0}</td>
                      <td className="px-1 py-2 text-right text-muted-foreground tabular-nums">{p.deaths ?? 0}</td>
                      <td className="px-1 py-2 text-right text-muted-foreground tabular-nums">{p.assists ?? 0}</td>
                      <td className="px-2 py-2 text-right text-foreground tabular-nums">
                        {p.net_worth != null ? p.net_worth.toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </CoachCard>
  );
}

export function Timeline({ block }: { block: TimelineBlock }) {
  // Vertical rail, one event per row: a horizontal layout overflows once a
  // match has many objective events (both teams' guardians, walkers, ...).
  // Each row reads on its own line; the dot color carries the tone (team0 /
  // team1 make the trade between teams obvious).
  const events = [...block.events].sort((a, b) => a.t - b.t);
  return (
    <CoachCard>
      <BlockHeading title={block.title} />
      <ol className="relative">
        {events.map((ev, i) => {
          const color = toneColor(ev.tone ?? "neutral");
          const last = i === events.length - 1;

          return (
            <li key={`${ev.t}-${ev.label}`} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-card"
                  style={{ borderColor: color, color }}
                >
                  <CoachIcon name={ev.icon} className="size-3" />
                </span>
                {last ? null : <span className="w-0.5 flex-1 bg-white/[0.08]" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 pb-4">
                <span className="w-11 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {formatClock(ev.t)}
                </span>
                <span className="text-sm font-medium" style={{ color }}>
                  {ev.label}
                </span>
                {ev.detail ? <span className="text-xs text-muted-foreground">{ev.detail}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </CoachCard>
  );
}

export function ItemBuild({ block }: { block: ItemBuildBlock }) {
  return (
    <CoachCard>
      <BlockHeading title={block.title} />
      <div className="space-y-3">
        {block.phases.map((phase) => {
          const ids = phase.item_ids ?? [];
          return (
            <div key={phase.label}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{phase.label}</span>
                {phase.note ? <span className="text-[11px] text-muted-foreground">{phase.note}</span> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ids.length > 0
                  ? ids.map((id) => (
                      <div
                        key={id}
                        className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] py-1 pr-2 pl-1"
                      >
                        <ItemImage itemId={id} className="size-7 rounded" />
                        <span className="max-w-28 truncate text-xs text-muted-foreground">
                          <ItemName itemId={id} />
                        </span>
                      </div>
                    ))
                  : (phase.item_names ?? []).map((name) => (
                      <span
                        key={name}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-xs text-muted-foreground"
                      >
                        {name}
                      </span>
                    ))}
              </div>
            </div>
          );
        })}
      </div>
    </CoachCard>
  );
}

function winPct(wr?: number | null): string | null {
  return wr == null ? null : `${Math.round(wr * 100)}%`;
}

const ITEM_STATUS = {
  good: { tone: "success", label: "on track" },
  late: { tone: "warning", label: "late" },
  off_meta: { tone: "warning", label: "off meta" },
  missing: { tone: "critical", label: "missing" },
} as const;

export function ItemComparison({ block }: { block: ItemComparisonBlock }) {
  return (
    <CoachCard>
      <BlockHeading title={block.title} />
      {block.subtitle ? <p className="mb-3 text-xs text-muted-foreground">{block.subtitle}</p> : null}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
        {block.columns.map((col) => (
          <BuildColumnView key={col.label} column={col} />
        ))}
      </div>
    </CoachCard>
  );
}

function BuildColumnView({ column }: { column: BuildColumn }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="mb-2 flex items-center gap-1.5">
        {column.hero_id != null ? <HeroImage heroId={column.hero_id} className="size-5 rounded-full" /> : null}
        <span className="text-xs font-semibold" style={{ color: toneColor(column.tone ?? "neutral") }}>
          {column.label}
        </span>
      </div>
      <div className="space-y-1">
        {column.items.map((item) => {
          const status = item.status ? ITEM_STATUS[item.status] : null;
          const pct = winPct(item.win_rate);
          return (
            <div key={item.item_id} className="flex items-center gap-1.5 rounded-md px-1 py-1">
              <ItemImage itemId={item.item_id} className="size-6 rounded" />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                <ItemName itemId={item.item_id} />
              </span>
              {pct ? <span className="text-[11px] text-muted-foreground tabular-nums">{pct}</span> : null}
              {item.buy_time_s != null ? (
                <span className="text-[11px] text-muted-foreground tabular-nums">{formatClock(item.buy_time_s)}</span>
              ) : null}
              {status ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={toneSurface(status.tone, 0.8)}>
                  {status.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ABILITY_PALETTE = ["#f0a92b", "#3b9dff", "#a78bfa", "#34d399", "#fa4454"] as const;

function abilityColorMap(rows: AbilityOrderRow[], legend?: string[]): Map<string, string> {
  const m = new Map<string, string>();
  const assign = (name: string) => {
    if (!m.has(name)) m.set(name, ABILITY_PALETTE[m.size % ABILITY_PALETTE.length]);
  };
  (legend ?? []).forEach(assign);
  rows.forEach((r) => r.order.forEach(assign));
  return m;
}

function abbrev(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function AbilityOrderComparison({ block }: { block: AbilityOrderComparisonBlock }) {
  const maxLen = Math.max(1, ...block.rows.map((r) => r.order.length));
  const steps = Array.from({ length: maxLen }, (_, i) => i + 1);
  const colors = abilityColorMap(block.rows, block.abilities);
  return (
    <CoachCard className="overflow-x-auto">
      <BlockHeading title={block.title} />
      {block.abilities && block.abilities.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {block.abilities.map((name) => (
            <span key={name} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: colors.get(name) }} />
              {name}
            </span>
          ))}
        </div>
      ) : null}
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th aria-label="Line" />
            {steps.map((s) => (
              <th key={s} className="w-7 text-center font-medium text-muted-foreground">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <AbilityRowView key={row.label} row={row} steps={steps} colors={colors} />
          ))}
        </tbody>
      </table>
    </CoachCard>
  );
}

function AbilityRowView({
  row,
  steps,
  colors,
}: {
  row: AbilityOrderRow;
  steps: number[];
  colors: Map<string, string>;
}) {
  const pct = winPct(row.win_rate);
  return (
    <tr>
      <td className="pr-2 whitespace-nowrap">
        <span className="font-medium text-foreground" style={row.tone ? { color: toneColor(row.tone) } : undefined}>
          {row.label}
        </span>
        {pct ? <span className="ml-1.5 text-[11px] text-muted-foreground tabular-nums">{pct}</span> : null}
      </td>
      {steps.map((s) => {
        const name = row.order[s - 1];
        if (!name)
          return (
            <td key={s} className="size-7 rounded bg-white/[0.04] text-center text-transparent">
              ·
            </td>
          );
        const color = colors.get(name) ?? "#8b949e";
        const diverges = row.diverges_at != null && s === row.diverges_at;
        return (
          <td key={s} className="p-0">
            <div
              title={name}
              className={cn(
                "flex size-7 items-center justify-center rounded text-[10px] font-semibold",
                diverges && "ring-2 ring-[#fa4454]",
              )}
              style={{ backgroundColor: hexAlpha(color, 0.22), color }}
            >
              {abbrev(name)}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

export function AbilityOrder({ block }: { block: AbilityOrderBlock }) {
  const max = block.max_level ?? 12;
  const levels = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <CoachCard className="overflow-x-auto">
      <BlockHeading title={block.title} />
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th aria-label="Ability" />
            {levels.map((l) => (
              <th key={l} className="w-6 text-center font-medium text-muted-foreground">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.abilities.map((ab) => {
            const set = new Set(ab.order);
            return (
              <tr key={ab.ability}>
                <td className="pr-2 font-medium whitespace-nowrap text-foreground">{ab.ability}</td>
                {levels.map((l) => (
                  <td
                    key={l}
                    className={cn(
                      "size-6 rounded text-center",
                      set.has(l)
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "bg-white/[0.04] text-transparent",
                    )}
                  >
                    {set.has(l) ? "•" : ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </CoachCard>
  );
}
