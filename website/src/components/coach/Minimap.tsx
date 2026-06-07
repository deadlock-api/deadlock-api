import type { MapData } from "deadlock_api_client";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";

import { CoachIcon } from "~/lib/coach/icons";
import type { MapMarker, MapView, MinimapBlock, WinProbPoint } from "~/lib/coach/report";
import { toneColor } from "~/lib/coach/tones";

import { MapStage, useMapData } from "./MapStage";
import { BlockHeading, CoachCard } from "./shared";

// Used when the live map asset isn't available (offline / first paint): a
// styled stand-in so overlays still read correctly.
export const FALLBACK_MAP: MapData = {
  images: { minimap: "", background: "", frame: "", mid: "", plain: "" },
  objective_positions: {},
  zipline_paths: [],
  radius: 1,
};

// Crop a win-prob curve to a window around the scene so the sparkline shows
// the local momentum swing, not the whole match.
function cropWindow(points: WinProbPoint[], center: number, half = 360): WinProbPoint[] {
  const within = points.filter((p) => Math.abs(p.t - center) <= half);
  return within.length >= 2 ? within : points;
}

// When the agent didn't specify a camera, frame the action ourselves: fit the
// bounding box of the markers (the heroes in the scene) with some breathing room,
// so a tight teamfight opens zoomed in instead of lost on the full map.
function autoView(markers: MapMarker[]): MapView | undefined {
  const pts = markers.map((m) => m.at);
  if (pts.length < 2) return undefined;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 0.1;
  const extent = Math.max(maxX - minX, maxY - minY) + 2 * pad;
  // Only zoom when the cluster is genuinely tight; a spread-out scene stays full.
  if (extent >= 0.85) return undefined;
  const zoom = Math.min(3, Math.max(1, 1 / extent));
  return { at: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, zoom };
}

function nearestIndex(points: { t: number }[], t: number): number {
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = Math.abs(p.t - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// The minimap is a freeze-frame of one decisive scene: every hero on the map
// at that instant, plus the read (collapse arrows, danger zones). The side
// panel explains why the scene went well or badly.
export function Minimap({ block }: { block: MinimapBlock }) {
  const { data } = useMapData();
  const mapData = data ?? FALLBACK_MAP;
  const markers = block.markers ?? [];
  const focus = markers.find((m) => m.focus) ?? markers.find((m) => m.kind === "hero" && m.tone === "accent");
  const read = block.subtitle ?? focus?.detail ?? null;
  const detail = focus?.detail ?? null;
  const crit = toneColor("critical");

  const wp = block.win_prob ?? [];
  const sceneT = block.scene_t ?? null;
  const cropped = wp.length > 1 && sceneT != null ? cropWindow(wp, sceneT) : wp;

  const view = block.view ?? autoView(markers);

  return (
    <CoachCard>
      <BlockHeading title={block.title} subtitle={block.critical ? null : block.subtitle} icon="crosshair" />
      <div className="grid gap-4 lg:grid-cols-[1.25fr_minmax(16rem,0.8fr)]">
        <MapStage
          mapData={mapData}
          showObjectives={block.show_objectives ?? true}
          showZiplines={block.show_ziplines ?? false}
          zones={block.zones ?? []}
          paths={block.paths ?? []}
          heat={block.heat ?? []}
          markers={markers}
          smartLabels
          view={view}
          extra={
            block.scene_clock ? (
              <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/70 px-2 py-1 font-mono text-xs font-semibold text-white backdrop-blur">
                {block.scene_clock}
              </div>
            ) : null
          }
        />

        <div className="flex flex-col gap-3">
          {block.critical ? (
            <span
              className="flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase"
              style={{ backgroundColor: `${crit}26`, color: crit, border: `1px solid ${crit}80` }}
            >
              <CoachIcon name="warning" className="size-3.5" />
              Critical failure
            </span>
          ) : null}

          {block.headline ? (
            <h4 className="text-lg leading-tight font-bold text-foreground">{block.headline}</h4>
          ) : null}

          {read ? <p className="text-sm leading-relaxed text-muted-foreground">{read}</p> : null}

          {detail && detail !== read ? <p className="text-sm leading-relaxed text-foreground">{detail}</p> : null}

          {block.correction ? (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: `${toneColor("tip")}55`, backgroundColor: `${toneColor("tip")}12` }}
            >
              <div
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: toneColor("tip") }}
              >
                <CoachIcon name="lightbulb" className="size-4" />
                Strategic correction
              </div>
              <p className="text-sm leading-relaxed text-foreground">{block.correction}</p>
            </div>
          ) : null}

          {cropped.length > 1 ? (
            <div className="mt-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="mb-1 text-xs text-muted-foreground">Win probability around this moment</div>
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 48 }}>
                  <AreaChart data={cropped} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="scene-wp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={crit} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={crit} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={[0, 1]} hide />
                    <ReferenceLine y={0.5} stroke="var(--border)" strokeDasharray="3 3" />
                    {sceneT != null ? (
                      <ReferenceLine
                        x={nearestIndex(cropped, sceneT)}
                        stroke="#fff"
                        strokeOpacity={0.6}
                        strokeWidth={1.5}
                      />
                    ) : null}
                    <Area
                      type="monotone"
                      dataKey="p"
                      stroke={crit}
                      strokeWidth={2}
                      fill="url(#scene-wp)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {block.legend && block.legend.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3">
              {block.legend.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: toneColor(item.tone ?? "neutral") }}
                  />
                  {item.icon ? <CoachIcon name={item.icon} className="size-3.5" /> : null}
                  <span className="text-foreground">{item.label}</span>
                  {item.value ? <span>{item.value}</span> : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </CoachCard>
  );
}
