import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";

import { CoachIcon } from "~/lib/coach/icons";
import type { MapMarker, MapView, MatchReplayBlock, Point, ReplayTrack } from "~/lib/coach/report";
import { toneColor } from "~/lib/coach/tones";
import { cn } from "~/lib/utils";

import { MapStage, useMapData } from "./MapStage";
import { FALLBACK_MAP } from "./Minimap";
import { BlockHeading, CoachCard, formatClock, useReplaySeek } from "./shared";

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function sampleWinProb(wp: { t: number; p: number }[], t: number): number | null {
  if (wp.length === 0) return null;
  if (t <= wp[0].t) return wp[0].p;
  if (t >= wp[wp.length - 1].t) return wp[wp.length - 1].p;
  for (let i = 0; i < wp.length - 1; i++) {
    if (t >= wp[i].t && t <= wp[i + 1].t) {
      const span = wp[i + 1].t - wp[i].t || 1;
      return lerp(wp[i].p, wp[i + 1].p, (t - wp[i].t) / span);
    }
  }
  return wp[wp.length - 1].p;
}

function sampleIndexAt(s: ReplayTrack["samples"], t: number): number {
  if (t <= s[0].t) return 0;
  if (t >= s[s.length - 1].t) return s.length - 1;
  for (let i = 0; i < s.length - 1; i++) {
    if (t >= s[i].t && t <= s[i + 1].t) return i;
  }
  return s.length - 1;
}

function positionAt(track: ReplayTrack, t: number): Point {
  const s = track.samples;
  if (s.length === 0) return { x: 0.5, y: 0.5 };
  if (t <= s[0].t) return s[0].at;
  if (t >= s[s.length - 1].t) return s[s.length - 1].at;
  for (let i = 0; i < s.length - 1; i++) {
    if (t >= s[i].t && t <= s[i + 1].t) {
      const span = s[i + 1].t - s[i].t || 1;
      const f = (t - s[i].t) / span;
      // Don't slide between a live spot and the fountain — snap to whichever
      // sample owns this instant so a dead player sits crisply at the fountain.
      if (s[i].dead) return s[i].at;
      if (s[i + 1].dead) return s[i + 1].at;
      return { x: lerp(s[i].at.x, s[i + 1].at.x, f), y: lerp(s[i].at.y, s[i + 1].at.y, f) };
    }
  }
  return s[s.length - 1].at;
}

// Whether the player is dead at time t — true once we've reached a sample
// flagged dead, until the next live sample.
function deadAt(track: ReplayTrack, t: number): boolean {
  const s = track.samples;
  if (s.length === 0) return false;
  return s[sampleIndexAt(s, t)].dead === true;
}

// The recent slice of a track's route up to `t` (only the trailing `window`
// seconds), so the trail reads as "where this hero just came from" rather than
// the entire game. Returns SVG-space points (0..100).
const TRAIL_WINDOW = 240;

function trailPoints(track: ReplayTrack, t: number, window: number): { x: number; y: number }[] {
  const s = track.samples;
  if (s.length === 0) return [];
  const start = t - window;
  const out: { x: number; y: number }[] = [];
  for (const sample of s) {
    if (sample.t <= start || sample.t > t) continue;
    // Skip fountain (dead) samples so the trail doesn't shoot off the map.
    if (sample.dead) continue;
    out.push({ x: sample.at.x * 100, y: sample.at.y * 100 });
  }
  // Anchor to the live head position so the trail meets the marker cleanly.
  if (!deadAt(track, t)) {
    const head = positionAt(track, t);
    out.push({ x: head.x * 100, y: head.y * 100 });
  }
  return out;
}

function trackTone(track: ReplayTrack): "accent" | "team0" | "team1" {
  if (track.is_focus) return "accent";
  return track.team === 0 ? "team0" : "team1";
}

// Frame the camera on the action inside a clip: the bounding box of every live
// sample in the window, padded, clamped to a sane zoom range.
function clipView(tracks: ReplayTrack[], start: number, end: number): MapView | null {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let count = 0;
  for (const track of tracks) {
    for (const s of track.samples) {
      if (s.dead || s.t < start || s.t > end) continue;
      minX = Math.min(minX, s.at.x);
      maxX = Math.max(maxX, s.at.x);
      minY = Math.min(minY, s.at.y);
      maxY = Math.max(maxY, s.at.y);
      count++;
    }
  }
  if (count === 0) return null;
  const extent = Math.max(maxX - minX, maxY - minY) + 0.18;
  return {
    at: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    zoom: Math.min(4, Math.max(1.4, 1 / extent)),
  };
}

export function MatchReplay({ block }: { block: MatchReplayBlock }) {
  const { data } = useMapData();
  const mapData = data ?? FALLBACK_MAP;
  const duration = block.duration_s || 1;

  // Clip mode: the scrubber spans only [t_start, t_end] and opens paused on
  // `anchor_t` (the moment the coach is showing), instead of the whole match.
  const tStart = block.t_start ?? null;
  const tEnd = block.t_end ?? null;
  const clip = tStart != null && tEnd != null && tEnd > tStart;
  const clipStart = clip ? Math.max(0, tStart) : 0;
  const clipEnd = clip ? Math.min(tEnd, duration) : duration;
  const span = Math.max(1, clipEnd - clipStart);
  const anchor = block.anchor_t != null ? Math.min(Math.max(block.anchor_t, clipStart), clipEnd) : null;

  const [t, setT] = useState(anchor ?? clipStart);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Evidence chips elsewhere in the report can jump this replay to a moment.
  // A clip declines moments well outside its window so a full-match replay
  // (or another clip) in the same report can take them instead.
  const seekCtx = useReplaySeek();
  useEffect(() => {
    if (!seekCtx) return;
    return seekCtx.register((target) => {
      if (clip && (target < clipStart - 30 || target > clipEnd + 30)) return false;
      setPlaying(false);
      setT(Math.min(Math.max(target, clipStart), clipEnd));
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    });
  }, [seekCtx, clip, clipStart, clipEnd]);

  // A whole match plays in ~20 real seconds; a clip plays near real time
  // (compressed only past the minute mark) so the situation stays readable.
  const speed = clip ? Math.max(1, span / 60) : duration / 20;

  useEffect(() => {
    if (!playing) return;
    const step = (ts: number) => {
      if (lastRef.current != null) {
        const dt = (ts - lastRef.current) / 1000;
        setT((prev) => {
          const next = prev + dt * speed;
          if (next >= clipEnd) {
            setPlaying(false);
            return clipEnd;
          }
          return next;
        });
      }
      lastRef.current = ts;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [playing, speed, clipEnd]);

  const toggle = () => {
    if (t >= clipEnd) setT(clipStart);
    setPlaying((p) => !p);
  };

  // Plain derivations — the React Compiler memoizes these for us.
  const tracks = block.tracks ?? [];
  const trailWindow = clip ? span : TRAIL_WINDOW;
  const view = clip ? clipView(tracks, clipStart, clipEnd) : null;
  const markers: MapMarker[] = tracks.map((track) => {
    const dead = deadAt(track, t);
    return {
      at: positionAt(track, t),
      label: track.is_focus ? track.label : null,
      kind: "hero",
      tone: trackTone(track),
      hero_id: track.hero_id ?? null,
      pulse: track.is_focus && !dead,
      dimmed: dead,
    };
  });

  const trails = (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="none">
      <defs>
        <marker
          id="replay-head"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,1 L9,5 L0,9 z" fill="currentColor" />
        </marker>
      </defs>
      {tracks.map((track) => {
        const pts = trailPoints(track, t, trailWindow);
        if (pts.length < 2) return null;
        const dead = deadAt(track, t);
        const color = toneColor(trackTone(track));
        const baseOpacity = track.is_focus ? 0.85 : 0.5;
        return (
          <polyline
            key={`${track.label}-${track.hero_id ?? ""}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={dead ? "#8b949e" : color}
            strokeWidth={track.is_focus ? 2 : 1.4}
            strokeOpacity={dead ? 0.2 : baseOpacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={track.team === 0 && !track.is_focus ? "3 2" : undefined}
            vectorEffect="non-scaling-stroke"
            markerEnd={dead ? undefined : "url(#replay-head)"}
            style={{ color: dead ? "#8b949e" : color }}
          />
        );
      })}
    </svg>
  );

  const winNow = sampleWinProb(block.win_prob ?? [], t);
  const winColor = (winNow ?? 0.5) >= 0.5 ? toneColor("success") : toneColor("critical");

  const sortedAnns = [...(block.annotations ?? [])].sort((a, b) => a.t - b.t);
  let activeAnnotation: (typeof sortedAnns)[number] | null = null;
  for (const a of sortedAnns) {
    if (t >= a.t - 1) activeAnnotation = a;
  }

  return (
    <div ref={cardRef}>
      <CoachCard>
        <BlockHeading title={block.title ?? "Match replay"} subtitle={block.subtitle} icon="play" />
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <MapStage
            mapData={mapData}
            showObjectives
            markers={markers}
            mapOverlay={trails}
            view={view}
            extra={
              <>
                <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-2 py-1 font-mono text-xs text-white backdrop-blur">
                  {formatClock(t)} / {formatClock(duration)}
                  {clip ? (
                    <span className="ml-1.5 rounded bg-primary/30 px-1 py-px text-[10px] font-semibold text-primary-foreground">
                      Clip {formatClock(clipStart)}-{formatClock(clipEnd)}
                    </span>
                  ) : null}
                </div>
                <div className="pointer-events-none absolute top-2 right-2 flex flex-col gap-1 rounded-md bg-black/55 px-2 py-1.5 text-[10px] backdrop-blur">
                  {tracks.map((track) => {
                    const dead = deadAt(track, t);
                    return (
                      <span
                        key={`${track.label}-${track.hero_id ?? ""}`}
                        className="flex items-center gap-1.5 whitespace-nowrap"
                        style={{ opacity: dead ? 0.5 : 1 }}
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: dead ? "#8b949e" : toneColor(trackTone(track)) }}
                        />
                        <span className={track.is_focus ? "font-semibold text-white" : "text-white/70"}>
                          {track.label}
                          {dead ? " (dead)" : ""}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </>
            }
          />

          <div className="flex flex-col gap-3">
            {/* win probability — color tracks the scrub head (green ahead / red behind) */}
            {block.win_prob && block.win_prob.length > 1 ? (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Your team win chance</span>
                  <span className="font-semibold tabular-nums" style={{ color: winColor }}>
                    {winNow != null ? `${Math.round(winNow * 100)}%` : "—"}
                  </span>
                </div>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 80 }}>
                    <AreaChart data={block.win_prob} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="wp-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={winColor} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={winColor} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <YAxis domain={[0, 1]} hide />
                      <ReferenceLine y={0.5} stroke="var(--border)" strokeDasharray="3 3" />
                      {(block.objective_events ?? []).map((ev) => (
                        <ReferenceLine
                          key={`obj-${ev.t}-${ev.label}`}
                          x={nearestIndex(block.win_prob ?? [], ev.t)}
                          stroke={toneColor(ev.tone ?? "neutral")}
                          strokeOpacity={0.35}
                          strokeWidth={1}
                        />
                      ))}
                      <ReferenceLine
                        x={nearestIndex(block.win_prob, t)}
                        stroke="#fff"
                        strokeOpacity={0.7}
                        strokeWidth={1.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="p"
                        stroke={winColor}
                        strokeWidth={2}
                        fill="url(#wp-grad)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            {/* what went wrong */}
            <div
              className="min-h-24 flex-1 rounded-lg border bg-white/[0.02] p-3 transition-colors"
              style={{
                borderColor: activeAnnotation ? `${toneColor(activeAnnotation.tone ?? "warning")}55` : undefined,
              }}
            >
              {activeAnnotation ? (
                <div className="flex gap-2.5">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `${toneColor(activeAnnotation.tone ?? "warning")}1f`,
                      color: toneColor(activeAnnotation.tone ?? "warning"),
                    }}
                  >
                    <CoachIcon
                      name={(activeAnnotation.tone ?? "warning") === "success" ? "check" : "warning"}
                      className="size-4"
                    />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                        {formatClock(activeAnnotation.t)}
                      </span>
                      {activeAnnotation.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{activeAnnotation.body}</p>
                  </div>
                </div>
              ) : (
                <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {clip
                    ? "Press play to watch the moment unfold."
                    : "Press play to walk the match. Key moments appear here."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* transport + scrubber with annotation/objective ticks */}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
            aria-label={playing ? "Pause" : "Play"}
          >
            <CoachIcon name={playing ? "pause" : "play"} className="size-4" />
          </button>
          <div className="relative flex-1">
            {/* annotation ticks (the coaching moments) sit just above the rail */}
            <div className="pointer-events-none absolute inset-x-0 -top-2 h-2">
              {sortedAnns
                .filter((ev) => ev.t >= clipStart && ev.t <= clipEnd)
                .map((ev) => {
                  const active = activeAnnotation === ev;
                  return (
                    <button
                      key={`ann-${ev.t}-${ev.title}`}
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setT(ev.t);
                      }}
                      className="pointer-events-auto absolute top-0 h-2 w-1 -translate-x-1/2 rounded-full transition-transform hover:scale-150"
                      style={{
                        left: `${((ev.t - clipStart) / span) * 100}%`,
                        backgroundColor: toneColor(ev.tone ?? "warning"),
                        transform: active ? "translateX(-50%) scaleY(1.6)" : undefined,
                      }}
                      aria-label={`${formatClock(ev.t)} — ${ev.title}`}
                      title={`${formatClock(ev.t)} — ${ev.title}`}
                    />
                  );
                })}
            </div>
            {anchor != null ? (
              <div
                className="pointer-events-none absolute -top-2 h-2 w-px bg-white/70"
                style={{ left: `${((anchor - clipStart) / span) * 100}%` }}
                title={`The moment — ${formatClock(anchor)}`}
              />
            ) : null}
            <input
              type="range"
              aria-label="Scrub match timeline"
              min={clipStart}
              max={clipEnd}
              step={1}
              value={t}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
              className={cn(
                "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10",
                "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow",
                "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
              )}
              style={{
                background: `linear-gradient(90deg, var(--primary) ${((t - clipStart) / span) * 100}%, rgba(255,255,255,0.1) ${((t - clipStart) / span) * 100}%)`,
              }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {clip
              ? `${formatClock(t)} (${formatClock(clipStart)}-${formatClock(clipEnd)})`
              : `${formatClock(t)} / ${formatClock(duration)}`}
          </span>
        </div>

        {/* objective events laid out on the same timeline, color-coded by team */}
        {block.objective_events && block.objective_events.length > 0 ? (
          <div className="relative mt-2 mr-14 ml-12 h-6">
            {block.objective_events
              .filter((ev) => ev.t >= clipStart && ev.t <= clipEnd)
              .map((ev) => {
                const passed = t >= ev.t;
                const color = toneColor(ev.tone ?? "neutral");
                const frac = (ev.t - clipStart) / span;
                // Keep edge chips inside the rail by anchoring their near edge.
                const anchor = frac < 0.08 ? "0%" : frac > 0.92 ? "-100%" : "-50%";
                return (
                  <button
                    key={`oe-${ev.t}-${ev.label}`}
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setT(ev.t);
                    }}
                    className="absolute top-0 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition"
                    style={{
                      left: `${frac * 100}%`,
                      transform: `translateX(${anchor})`,
                      borderColor: `${color}80`,
                      backgroundColor: passed ? `${color}26` : "transparent",
                      color: passed ? "#fff" : "var(--muted-foreground)",
                      opacity: passed ? 1 : 0.55,
                    }}
                    title={ev.detail ?? ev.label}
                  >
                    <CoachIcon name={ev.icon ?? "objective"} className="size-3" style={{ color }} />
                    {ev.label}
                  </button>
                );
              })}
          </div>
        ) : null}
      </CoachCard>
    </div>
  );
}

// recharts plots win_prob by row index; map the current time to the closest row.
function nearestIndex(wp: { t: number }[], t: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < wp.length; i++) {
    const d = Math.abs(wp[i].t - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
