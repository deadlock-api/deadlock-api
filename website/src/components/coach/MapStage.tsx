import { useQuery } from "@tanstack/react-query";
import type { MapData } from "deadlock_api_client";
import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";

import { HeroImage } from "~/components/HeroImage";
import { CoachIcon } from "~/lib/coach/icons";
import type { HeatPoint, MapMarker, MapPath, MapView, MapZone, Point } from "~/lib/coach/report";
import { teamLabel, toneColor } from "~/lib/coach/tones";
import { cn } from "~/lib/utils";
import { mapQueryOptions } from "~/queries/heatmap-queries";

import { usePanZoom } from "./usePanZoom";

export function useMapData() {
  return useQuery(mapQueryOptions);
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

// The API objective coordinates come from Valve's in-game `objectives_map.css`
// (`margin-left`/`margin-top` of 10%-wide icons, so the icon center is +0.05).
// Those margins live in a coordinate space that is horizontally compressed
// relative to our rendered minimap: the three lanes sit at margin ~0.21/0.45/0.69
// but the real lane terrain (from the game's lane textures) is at x ~0.12/0.50/0.88,
// a linear stretch about the mid lane (margin 0.45 -> image 0.5, scale ~1.73).
// Vertically the spaces line up, so y just needs the icon-center offset.
const OBJECTIVE_HALF = 0.05;
const OBJ_X_CENTER = 0.45;
const OBJ_X_SCALE = 1.45;

const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v));

function objectivePoint(key: string, op: { left_relative: number; top_relative: number }) {
  // The Patron (core) sits dead center on the mid axis; everything else maps
  // through the horizontal stretch onto its lane.
  const x = key.includes("core") ? 0.5 : clamp01(0.5 + OBJ_X_SCALE * (op.left_relative - OBJ_X_CENTER));
  const y = clamp01(op.top_relative + OBJECTIVE_HALF);
  return { x, y };
}

const TEAM0 = "#f0a92b";
const TEAM1 = "#3b9dff";

// Map an objective key (e.g. "team0_tier1_3", "team1_core") to a label,
// team color, and dot size. tier1 = Guardian, tier2 = Walker, titan = Base,
// core = Patron.
function objectiveMeta(key: string): { label: string; color: string; size: number } {
  const team = key.startsWith("team1") ? 1 : 0;
  const color = team === 0 ? TEAM0 : TEAM1;
  const side = teamLabel(team);
  let kind = "Objective";
  let size = 8;
  if (key.includes("core")) {
    kind = "Patron";
    size = 14;
  } else if (key.includes("titan")) {
    kind = "Base Guardian";
    size = 11;
  } else if (key.includes("tier2")) {
    kind = "Walker";
    size = 9;
  } else if (key.includes("tier1")) {
    kind = "Guardian";
    size = 7;
  }
  return { label: `${side} ${kind}`, color, size };
}

function markerIcon(kind: MapMarker["kind"]): string {
  switch (kind) {
    case "skull":
      return "skull";
    case "kill":
      return "swords";
    case "flag":
      return "flag";
    case "star":
      return "star";
    case "ward":
      return "eye";
    case "pin":
      return "map-pin";
    case "objective":
      return "objective";
    default:
      return "dot";
  }
}

// Greedily place labels for point markers so they don't pile on top of each
// other. Each label is anchored to its marker's precise point; we nudge it to
// the nearest of eight directions that clears already-placed labels, and draw
// a thin leader line back to the point when the label had to move. Distances
// are in the 0..1 normalized map space; an approximate label half-size keeps
// the packing cheap and deterministic (stable across renders).
interface PlacedLabel {
  index: number;
  anchor: Point;
  pos: Point;
  moved: boolean;
}

const LABEL_HALF_W = 0.07;
const LABEL_HALF_H = 0.032;
const LABEL_OFFSETS: Point[] = [
  { x: 0, y: -0.07 },
  { x: 0.09, y: -0.05 },
  { x: 0.1, y: 0 },
  { x: 0.09, y: 0.06 },
  { x: 0, y: 0.08 },
  { x: -0.09, y: 0.06 },
  { x: -0.1, y: 0 },
  { x: -0.09, y: -0.05 },
];

function overlaps(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < LABEL_HALF_W * 2 && Math.abs(a.y - b.y) < LABEL_HALF_H * 2;
}

function placeLabels(markers: MapMarker[], skipKind?: MapMarker["kind"]): PlacedLabel[] {
  const labeled = markers.map((m, index) => ({ m, index })).filter(({ m }) => m.label && m.kind !== skipKind);
  // Place denser clusters last so the crowded ones fan out around the spread ones.
  const placed: PlacedLabel[] = [];
  const taken: Point[] = [];
  for (const { m, index } of labeled) {
    const anchor = m.at;
    let best: Point | null = null;
    for (const off of LABEL_OFFSETS) {
      const cand = { x: anchor.x + off.x, y: anchor.y + off.y };
      if (cand.x < 0.06 || cand.x > 0.94 || cand.y < 0.05 || cand.y > 0.95) continue;
      if (taken.some((t) => overlaps(t, cand))) continue;
      best = cand;
      break;
    }
    if (!best) {
      // Everything collided — stack downward from the anchor until clear.
      let y = anchor.y;
      let cand = { x: anchor.x, y };
      while (taken.some((t) => overlaps(t, cand)) && y < 0.95) {
        y += LABEL_HALF_H * 2.2;
        cand = { x: Math.min(0.94, anchor.x), y };
      }
      best = cand;
    }
    taken.push(best);
    const moved = Math.hypot(best.x - anchor.x, best.y - anchor.y) > 0.012;
    placed.push({ index, anchor, pos: best, moved });
  }
  return placed;
}

const NO_ZONES: MapZone[] = [];
const NO_PATHS: MapPath[] = [];
const NO_HEAT: HeatPoint[] = [];
const NO_MARKERS: MapMarker[] = [];

// Assign a 1-based chronological number to every marker of `kind` (markers
// arrive in event order). Returns a map from marker array index -> number so
// the badge on the map and the row in the side list stay in sync.
export function numberMarkers(markers: MapMarker[], kind: MapMarker["kind"]): Map<number, number> {
  const out = new Map<number, number>();
  let n = 0;
  markers.forEach((m, i) => {
    if (m.kind === kind) {
      n += 1;
      out.set(i, n);
    }
  });
  return out;
}

// The shared map surface: minimap image, an SVG overlay (zones / heat /
// paths drawn in a 0..100 user space), and an HTML marker layer on top so
// markers can use hero portraits and lucide icons. `extra` lets the replay
// inject animated markers.
export function MapStage({
  mapData,
  showObjectives = false,
  showZiplines = false,
  zones = NO_ZONES,
  paths = NO_PATHS,
  heat = NO_HEAT,
  markers = NO_MARKERS,
  smartLabels = false,
  sequenceKind,
  view,
  interactive = true,
  mapOverlay,
  extra,
  className,
}: {
  mapData: MapData;
  showObjectives?: boolean;
  showZiplines?: boolean;
  zones?: MapZone[];
  paths?: MapPath[];
  heat?: HeatPoint[];
  markers?: MapMarker[];
  smartLabels?: boolean;
  // When set, markers of this kind get chronological number badges and a
  // connecting "sequence" arrow trail (e.g. the order of deaths).
  sequenceKind?: MapMarker["kind"];
  // Initial camera (center + zoom). The user can still pan/zoom from here.
  view?: MapView | null;
  // Allow drag/wheel/pinch pan-zoom and show the zoom controls.
  interactive?: boolean;
  // Map-space overlay rendered INSIDE the transform (pans/zooms with the map),
  // e.g. the replay's movement trails. `extra` stays pinned to the viewport.
  mapOverlay?: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  const { containerRef, transform, isZoomed, dragging, zoomIn, zoomOut, reset, bind } = usePanZoom(view, interactive);
  const uid = useId().replace(/:/g, "");
  const maxWeight = Math.max(1, ...heat.map((h) => h.weight ?? 1));
  const objectives = Object.entries(mapData.objective_positions ?? {});
  const numbers = sequenceKind ? numberMarkers(markers, sequenceKind) : null;
  // The ordered points of the numbered sequence, for the connecting arrow trail.
  const sequencePoints = numbers ? [...numbers.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => markers[i].at) : [];
  // For static maps we de-overlap labels and draw leader lines; replay markers
  // animate and just carry their label inline. Numbered markers carry only a
  // badge, so they don't need a placed text label.
  const placedLabels = smartLabels ? placeLabels(markers, sequenceKind) : [];
  const placedByIndex = new Map(placedLabels.map((p) => [p.index, p]));

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative aspect-square w-full touch-none overflow-hidden rounded-xl border border-white/[0.08] bg-black/40",
        interactive && (dragging ? "cursor-grabbing" : isZoomed ? "cursor-grab" : "cursor-default"),
        className,
      )}
      {...(interactive ? bind : {})}
    >
      <div className="absolute inset-0 origin-top-left" style={{ transform, willChange: "transform" }}>
        {mapData.images.minimap ? (
          <img
            src={mapData.images.minimap}
            alt="Deadlock map"
            className="absolute inset-0 size-full object-cover opacity-90"
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: "#0b1118",
              backgroundImage:
                "radial-gradient(circle at 30% 30%, rgba(240,169,43,0.12), transparent 40%), radial-gradient(circle at 70% 70%, rgba(59,157,255,0.12), transparent 40%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "100% 100%, 100% 100%, 8% 8%, 8% 8%",
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30" />

        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" preserveAspectRatio="none">
          <defs>
            <radialGradient id={`heat-${uid}`}>
              <stop offset="0%" stopColor="#fa4454" stopOpacity={0.85} />
              <stop offset="55%" stopColor="#f59e0b" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </radialGradient>
            {paths.map((p, i) => (
              <marker
                key={`arrow-${p.label ?? ""}-${p.points[0]?.x}-${p.points[0]?.y}`}
                id={`arrow-${uid}-${i}`}
                viewBox="0 0 12 12"
                refX="8"
                refY="6"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                <path
                  d="M1,1 L11,6 L1,11 L3.5,6 z"
                  fill={toneColor(p.tone ?? "accent")}
                  stroke="#0b1118"
                  strokeWidth={0.6}
                />
              </marker>
            ))}
            <filter id={`pathglow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id={`seqarrow-${uid}`}
              viewBox="0 0 12 12"
              refX="7"
              refY="6"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M1,1 L11,6 L1,11 L3.5,6 z" fill="#ffffff" fillOpacity={0.85} />
            </marker>
          </defs>

          {/* heat */}
          {heat.map((h) => (
            <circle
              key={`h-${h.at.x}-${h.at.y}`}
              cx={h.at.x * 100}
              cy={h.at.y * 100}
              r={4 + 7 * ((h.weight ?? 1) / maxWeight)}
              fill={`url(#heat-${uid})`}
            />
          ))}

          {/* zones */}
          {zones.map((z) => (
            <ZoneShape key={`z-${z.label ?? z.shape ?? ""}-${z.at?.x ?? ""}-${z.at?.y ?? ""}`} zone={z} />
          ))}

          {/* ziplines */}
          {showZiplines &&
            (mapData.zipline_paths ?? []).map((zp) => (
              <Zipline
                key={`zl-${zp.color}-${zp.P0_points[0]?.[0] ?? ""}-${zp.P0_points[0]?.[1] ?? ""}`}
                points={zp.P0_points}
                color={zp.color}
              />
            ))}

          {/* paths (rotations / routes): dark casing + glowing colored line +
            mid-route chevrons so the direction of travel reads at a glance */}
          {paths.map((p, i) => {
            const pts = p.points.map((pt) => `${pt.x * 100},${pt.y * 100}`).join(" ");
            const color = toneColor(p.tone ?? "accent");
            const w = p.width ?? 3.5;
            return (
              <g key={`p-${p.label ?? ""}-${p.points[0]?.x}-${p.points[0]?.y}`}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke="#0b1118"
                  strokeWidth={w + 2.5}
                  strokeOpacity={0.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth={w}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={p.dashed ? "6 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                  filter={`url(#pathglow-${uid})`}
                  markerEnd={p.arrow !== false ? `url(#arrow-${uid}-${i})` : undefined}
                />
                {p.arrow !== false ? <PathChevrons points={p.points} color={color} /> : null}
              </g>
            );
          })}

          {/* sequence connector: order-of-events arrows between numbered markers */}
          {sequencePoints.length > 1
            ? sequencePoints.slice(0, -1).map((a, i) => {
                const b = sequencePoints[i + 1];
                // Shorten each segment so it stops short of the badges at both ends.
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const trim = 0.026;
                const ax = a.x + (dx / len) * trim;
                const ay = a.y + (dy / len) * trim;
                const bx = b.x - (dx / len) * trim;
                const by = b.y - (dy / len) * trim;
                return (
                  <line
                    key={`seq-${a.x}-${a.y}-${b.x}-${b.y}`}
                    x1={ax * 100}
                    y1={ay * 100}
                    x2={bx * 100}
                    y2={by * 100}
                    stroke="#ffffff"
                    strokeOpacity={0.55}
                    strokeWidth={1.6}
                    strokeDasharray="3 2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    markerEnd={`url(#seqarrow-${uid})`}
                  />
                );
              })
            : null}
        </svg>

        {/* objectives, mapped from the game's CSS margin space onto the lanes */}
        {showObjectives &&
          objectives.map(([key, op]) => {
            const meta = objectiveMeta(key);
            const at = objectivePoint(key, op);
            return (
              <span
                key={key}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border shadow"
                style={{
                  left: pct(at.x),
                  top: pct(at.y),
                  width: meta.size,
                  height: meta.size,
                  borderColor: "rgba(255,255,255,0.7)",
                  backgroundColor: meta.color,
                }}
                title={meta.label}
              />
            );
          })}

        {/* zone labels: pinned to the top edge of the region so they don't sit
          on the markers inside it */}
        {zones
          .filter((z) => z.label && z.at)
          .map((z) => {
            const at = z.at as Point;
            const r = z.radius ?? 0.1;
            return (
              <MapLabel
                key={`zlbl-${z.label ?? ""}-${at.x}-${at.y}`}
                at={{ x: at.x, y: Math.max(0.05, at.y - r - 0.01) }}
                tone={z.tone ?? "warning"}
                text={z.label ?? ""}
                icon={(z.tone ?? "warning") === "success" ? "shield" : "warning"}
              />
            );
          })}

        {/* path labels: pinned to the route's end (the destination of the arrow) */}
        {paths
          .filter((p) => p.label)
          .map((p) => {
            const end = p.points[p.points.length - 1];
            return (
              <MapLabel
                key={`plbl-${p.label ?? ""}-${end.x}-${end.y}`}
                at={end}
                tone={p.tone ?? "accent"}
                text={p.label ?? ""}
                icon="route"
              />
            );
          })}

        {/* leader lines from de-overlapped labels back to their precise points */}
        {placedLabels.length > 0 ? (
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 size-full"
            preserveAspectRatio="none"
          >
            {placedLabels
              .filter((pl) => pl.moved)
              .map((pl) => (
                <line
                  key={`ll${pl.index}`}
                  x1={pl.anchor.x * 100}
                  y1={pl.anchor.y * 100}
                  x2={pl.pos.x * 100}
                  y2={pl.pos.y * 100}
                  stroke={toneColor(markers[pl.index].tone ?? "accent")}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>
        ) : null}

        {/* markers */}
        {markers.map((m, i) => (
          <Marker
            key={`m-${m.kind ?? "dot"}-${m.at.x}-${m.at.y}-${m.label ?? ""}`}
            marker={m}
            label={placedByIndex.get(i)}
            smartLabels={smartLabels}
            seqNumber={numbers?.get(i)}
          />
        ))}

        {mapOverlay}
      </div>

      {extra}

      {interactive ? <ZoomControls isZoomed={isZoomed} zoomIn={zoomIn} zoomOut={zoomOut} reset={reset} /> : null}
    </div>
  );
}

function ZoomControls({
  isZoomed,
  zoomIn,
  zoomOut,
  reset,
}: {
  isZoomed: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}) {
  // Stop pointer-down on the buttons from starting a map drag.
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const btn =
    "flex size-7 items-center justify-center rounded-md border border-white/15 bg-black/70 text-white/90 backdrop-blur transition hover:bg-black/90";
  return (
    <div className="absolute right-2 bottom-2 z-20 flex flex-col gap-1">
      {isZoomed ? (
        <button
          type="button"
          onClick={reset}
          onPointerDown={stop}
          className={cn(btn, "mb-0.5")}
          aria-label="Reset view"
          title="Reset view"
        >
          <CoachIcon name="crosshair" className="size-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={zoomIn}
        onPointerDown={stop}
        className={cn(btn, "text-lg leading-none")}
        aria-label="Zoom in"
        title="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={zoomOut}
        onPointerDown={stop}
        className={cn(btn, "text-lg leading-none disabled:opacity-40")}
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!isZoomed}
      >
        −
      </button>
    </div>
  );
}

function ZoneShape({ zone }: { zone: MapZone }) {
  const color = toneColor(zone.tone ?? "warning");
  const common = {
    fill: color,
    fillOpacity: 0.14,
    stroke: color,
    strokeOpacity: 0.6,
    strokeWidth: 2,
    strokeDasharray: "4 3",
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (zone.shape === "rect" && zone.at && zone.size) {
    return (
      <rect
        x={(zone.at.x - zone.size.x) * 100}
        y={(zone.at.y - zone.size.y) * 100}
        width={zone.size.x * 2 * 100}
        height={zone.size.y * 2 * 100}
        rx={1.5}
        {...common}
      />
    );
  }
  if (zone.shape === "polygon" && zone.points) {
    return <polygon points={zone.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} {...common} />;
  }
  if (zone.at) {
    return <circle cx={zone.at.x * 100} cy={zone.at.y * 100} r={(zone.radius ?? 0.08) * 100} {...common} />;
  }
  return null;
}

function Zipline({ points, color }: { points: number[][]; color: string }) {
  if (!points || points.length < 2) return null;
  return (
    <polyline
      points={points.map((p) => `${p[0] * 100},${p[1] * 100}`).join(" ")}
      fill="none"
      stroke={color || "#7dd3fc"}
      strokeWidth={1}
      strokeOpacity={0.45}
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function MapLabel({ at, tone, text, icon }: { at: Point; tone: string; text: string; icon?: string }) {
  const color = toneColor(tone as never);
  return (
    <span
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white shadow-lg backdrop-blur-sm"
      style={{ left: pct(at.x), top: pct(at.y), backgroundColor: `${color}d9`, borderColor: `${color}` }}
    >
      {icon ? <CoachIcon name={icon} className="size-3" /> : null}
      {text}
    </span>
  );
}

// Chevrons drawn along the interior of a route, each pointing along the
// direction of travel, so a path reads as a one-way rotation, not a wall.
function PathChevrons({ points, color }: { points: Point[]; color: string }) {
  if (points.length < 2) return null;
  const chevrons: { x: number; y: number; angle: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    chevrons.push({ x: mid.x * 100, y: mid.y * 100, angle });
  }
  return (
    <g>
      {chevrons.map((c) => (
        <path
          key={`${c.x}-${c.y}`}
          d="M-1.6,-1.6 L1.4,0 L-1.6,1.6"
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          transform={`translate(${c.x} ${c.y}) rotate(${c.angle})`}
        />
      ))}
    </g>
  );
}

export function Marker({
  marker,
  style,
  label,
  smartLabels = false,
  seqNumber,
}: {
  marker: MapMarker;
  style?: CSSProperties;
  label?: PlacedLabel;
  smartLabels?: boolean;
  seqNumber?: number;
}) {
  const color = toneColor(marker.tone ?? "accent");
  const isFocus = marker.focus === true;
  const isDeath = marker.kind === "skull";
  const isKill = marker.kind === "kill";
  // The focus player always reads in accent red so "you" pops out of the 5v5.
  const heroRing = isFocus ? toneColor("accent") : color;
  const positioned: CSSProperties = {
    left: pct(marker.at.x),
    top: pct(marker.at.y),
    ...style,
  };

  // Death = solid disc with skull. Kill = success ring with crossed swords.
  // Distinct silhouettes so win-vs-die reads instantly even when clustered.
  // A numbered death gets a numbered badge (matching the side event list).
  let glyph: ReactNode;
  if (seqNumber != null) {
    glyph = (
      <div
        className="flex size-[20px] items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums shadow-lg"
        style={{ borderColor: "#ffffff", backgroundColor: color, color: "#1a0c0f" }}
      >
        {seqNumber}
      </div>
    );
  } else if (marker.hero_id != null) {
    // Hero portrait for the scene board: team-colored ring, focus hero gets a
    // brighter/thicker ring + glow, dead heroes are grayed at their fountain.
    const sizeClass = isFocus ? "size-10" : "size-9";
    glyph = (
      <div
        className="relative overflow-hidden rounded-full shadow-lg"
        style={{
          border: `${isFocus ? 3 : 2}px solid ${marker.dimmed ? "rgba(255,255,255,0.3)" : heroRing}`,
          filter: marker.dimmed ? "grayscale(1) brightness(0.5)" : undefined,
          boxShadow: isFocus && !marker.dimmed ? `0 0 0 2px ${heroRing}55, 0 0 12px ${heroRing}aa` : undefined,
        }}
      >
        <HeroImage heroId={marker.hero_id} className={sizeClass} />
        {marker.dimmed ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <CoachIcon name="skull" className="size-4 text-white/85" />
          </span>
        ) : null}
      </div>
    );
  } else if (isDeath) {
    glyph = (
      <div
        className="flex size-[18px] items-center justify-center rounded-full border-2 shadow-lg"
        style={{ borderColor: "#0b1118", backgroundColor: color, color: "#1a0c0f" }}
      >
        <CoachIcon name="skull" className="size-3" />
      </div>
    );
  } else if (isKill) {
    glyph = (
      <div
        className="flex size-[18px] items-center justify-center rounded-sm border-2 shadow-lg"
        style={{ borderColor: color, backgroundColor: "#0b1118", color, transform: "rotate(45deg)" }}
      >
        <CoachIcon name="swords" className="size-3" style={{ transform: "rotate(-45deg)" }} />
      </div>
    );
  } else {
    glyph = (
      <div
        className="flex size-6 items-center justify-center rounded-full border-2 bg-black/70 shadow-lg"
        style={{ borderColor: color, color }}
      >
        <CoachIcon name={markerIcon(marker.kind)} className="size-3.5" />
      </div>
    );
  }

  // Numbered markers render only the badge (their text lives in the side
  // event list), so no floating label crowds the map.
  if (seqNumber != null) {
    return (
      <div className="pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-1/2" style={positioned}>
        {marker.pulse ? (
          <span
            className="absolute -inset-1.5 animate-ping rounded-full opacity-50"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <div className="relative">{glyph}</div>
      </div>
    );
  }

  // When smart labels are on, the label is positioned separately (with a
  // leader line) so it never covers a neighboring marker.
  if (smartLabels && marker.label) {
    const labelPos = label?.pos ?? marker.at;
    const labelColor = isFocus ? toneColor("accent") : marker.dimmed ? "#8b949e" : color;
    const ringColor = isFocus ? toneColor("accent") : color;
    return (
      <>
        <div
          className={cn("pointer-events-none absolute -translate-x-1/2 -translate-y-1/2", isFocus ? "z-[7]" : "z-[5]")}
          style={positioned}
        >
          {(marker.pulse || isFocus) && !marker.dimmed ? (
            <span
              className="absolute -inset-1 animate-ping rounded-full opacity-50"
              style={{ backgroundColor: ringColor }}
            />
          ) : null}
          <div className="relative">
            {glyph}
            {isFocus ? (
              <span
                className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-sm px-1 text-[9px] font-bold tracking-wide text-white shadow"
                style={{ backgroundColor: toneColor("accent") }}
              >
                YOU
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white shadow-lg backdrop-blur-sm",
            isFocus ? "z-[8]" : "z-[6]",
          )}
          style={{
            left: pct(labelPos.x),
            top: pct(labelPos.y),
            backgroundColor: `${labelColor}e6`,
            borderColor: labelColor,
          }}
        >
          {marker.label}
          {marker.dimmed ? " (dead)" : ""}
        </span>
      </>
    );
  }

  return (
    <div
      className="pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-1/2"
      style={{ ...positioned, opacity: marker.dimmed ? 0.65 : undefined }}
    >
      <div className="relative flex flex-col items-center">
        {marker.pulse && !marker.dimmed ? (
          <span className="absolute size-8 animate-ping rounded-full opacity-60" style={{ backgroundColor: color }} />
        ) : null}
        {glyph}
        {marker.label ? (
          <span
            className="mt-1 rounded-md border px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white shadow-lg"
            style={{
              backgroundColor: marker.dimmed ? "rgba(40,40,46,0.9)" : `${color}dd`,
              borderColor: marker.dimmed ? "rgba(255,255,255,0.25)" : color,
            }}
          >
            {marker.label}
            {marker.dimmed ? " (dead)" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
