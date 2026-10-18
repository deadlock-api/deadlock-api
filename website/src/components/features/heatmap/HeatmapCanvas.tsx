import type { MapData } from "deadlock_api_client";
import type { KillDeathStats } from "deadlock_api_client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { ChartOverlay, ChartOverlayItem, ChartStage, ChartStageFrame } from "~/components/patterns/charts/ChartOverlay";
import { ChartProbeCard, useChartProbe } from "~/components/patterns/charts/ChartProbe";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useElementSize } from "~/components/ui/hooks/use-element-size";
import { TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import {
  buildHeatGrids,
  GRID_RES,
  heatLUT,
  heatmapName,
  type HeatmapViewMode,
  normalizeHeatGrids,
  sampleBilinear,
  sampleHeat,
  summarizeHeatmap,
} from "./heatmap-grid";
import { HeatmapLegend } from "./HeatmapLegend";
import { composeMap } from "./map-composite";
import type { MapArt } from "./map-era";
import { SensitivitySlider } from "./SensitivitySlider";

const UNSIZED = { width: 0, height: 0 };

type ViewMode = HeatmapViewMode;

interface Reading {
  kills: number;
  deaths: number;
  /** All heroes' kills under the cursor, in the share view. */
  allKills?: number;
}

interface HeatmapCanvasProps {
  data: KillDeathStats[];
  mapData: MapData;
  /** How the map's art is drawn: `painted` before the City Never Sleeps rework, `silhouette` from it on. */
  art?: MapArt;
  viewMode: ViewMode;
  sensitivity: number;
  /** Cells with fewer events than this stay empty. */
  minEvents?: number;
  /** The same filters for all heroes, which the share view compares `data` against. */
  baseline?: KillDeathStats[];
  onSensitivityChange: (value: number) => void;
  /** The filters the events are drawn from, in words, for the map's accessible name: "The Hidden King, Haze". */
  scope?: string;
  /**
   * A choice the view still needs, shown over the bare map in place of the heat (the share view without a hero), so
   * the map keeps its place and size.
   */
  prompt?: string;
}

export default function HeatmapCanvas({
  data,
  mapData,
  art = "painted",
  viewMode,
  sensitivity,
  minEvents = 0,
  baseline,
  onSensitivityChange,
  scope,
  prompt,
}: HeatmapCanvasProps) {
  const summaryId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mapImages, setMapImages] = useState<"loading" | "ready" | "error">("loading");
  const [mapAttempt, setMapAttempt] = useState(0);
  const mapImagesLoaded = mapImages === "ready";
  const compositeRef = useRef<HTMLCanvasElement | null>(null);
  const probe = useChartProbe(containerRef);

  const radius = mapData.radius ?? 10752;

  const rawGrids = useMemo(() => (data.length > 0 ? buildHeatGrids(data, radius) : null), [data, radius]);
  const baselineGrids = useMemo(
    () => (viewMode === "share" && baseline && baseline.length > 0 ? buildHeatGrids(baseline, radius) : undefined),
    [viewMode, baseline, radius],
  );
  const heatGrid = useMemo(
    () => (rawGrids ? normalizeHeatGrids(rawGrids, viewMode, sensitivity, minEvents, baselineGrids) : null),
    [rawGrids, viewMode, sensitivity, minEvents, baselineGrids],
  );
  const legendMax = heatGrid?.maxValue ?? 0;
  const summary = useMemo(
    () => (rawGrids ? summarizeHeatmap(data, rawGrids, viewMode, heatGrid?.grid) : "Nothing to plot."),
    [data, rawGrids, viewMode, heatGrid],
  );

  useEffect(() => {
    let cancelled = false;
    // Without the rejection an unreachable image would leave "Loading map…" up forever.
    const load = async () => {
      const canvas = await composeMap(mapData.images, art);
      if (cancelled) return;
      compositeRef.current = canvas;
      setMapImages("ready");
    };
    load().catch(() => {
      if (!cancelled) setMapImages("error");
    });
    return () => {
      cancelled = true;
    };
  }, [mapData.images, art, mapAttempt]);

  const renderHeatmap = useCallback(() => {
    const mapCanvas = mapCanvasRef.current;
    const heatCanvas = heatCanvasRef.current;
    const composite = compositeRef.current;
    const container = containerRef.current;
    if (!mapCanvas || !heatCanvas || !composite || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerRect = container.getBoundingClientRect();
    const aspectRatio = composite.width / composite.height;

    let drawWidth: number;
    let drawHeight: number;
    if (containerRect.width / containerRect.height > aspectRatio) {
      drawHeight = containerRect.height;
      drawWidth = drawHeight * aspectRatio;
    } else {
      drawWidth = containerRect.width;
      drawHeight = drawWidth / aspectRatio;
    }

    const cssW = Math.round(drawWidth);
    const cssH = Math.round(drawHeight);
    const canvasWidth = Math.round(drawWidth * dpr);
    const canvasHeight = Math.round(drawHeight * dpr);

    for (const canvas of [mapCanvas, heatCanvas]) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    const mapCtx = mapCanvas.getContext("2d");
    if (mapCtx) {
      mapCtx.clearRect(0, 0, canvasWidth, canvasHeight);

      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const circleRadius = Math.min(canvasWidth, canvasHeight) * 0.48;
      mapCtx.save();
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
      mapCtx.clip();
      mapCtx.drawImage(composite, 0, 0, canvasWidth, canvasHeight);
      mapCtx.restore();
    }

    const heatCtx = heatCanvas.getContext("2d");
    if (!heatCtx) return;
    heatCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!heatGrid) return;

    const lut = heatLUT(heatGrid.scale);

    const imageData = heatCtx.createImageData(canvasWidth, canvasHeight);
    const pixels = imageData.data;

    for (let py = 0; py < canvasHeight; py++) {
      const gy = (py / canvasHeight) * (GRID_RES - 1);
      for (let px = 0; px < canvasWidth; px++) {
        const gx = (px / canvasWidth) * (GRID_RES - 1);

        const t = sampleHeat(heatGrid, gx, gy);
        if (t < 0) continue;

        const lutIdx = Math.min(255, Math.round(t * 255)) * 4;

        const off = (py * canvasWidth + px) * 4;
        pixels[off] = lut[lutIdx];
        pixels[off + 1] = lut[lutIdx + 1];
        pixels[off + 2] = lut[lutIdx + 2];
        pixels[off + 3] = lut[lutIdx + 3];
      }
    }

    heatCtx.putImageData(imageData, 0, 0);
  }, [heatGrid]);

  // The canvases are drawn to the container's size: again whenever it, the map or the heat changes.
  const containerSize = useElementSize(containerRef, { enabled: mapImagesLoaded });
  useEffect(() => {
    if (mapImagesLoaded && containerSize.width > 0) renderHeatmap();
  }, [mapImagesLoaded, containerSize, renderHeatmap]);

  // The counts under the probe, read straight from the raw grids: derived, not stored.
  const reading = useMemo((): Reading | null => {
    const at = probe.point?.rel;
    if (!at || !rawGrids || prompt) return null;
    const gx = at.x * (GRID_RES - 1);
    const gy = at.y * (GRID_RES - 1);
    const kills = sampleBilinear(rawGrids.killsRaw, GRID_RES, GRID_RES, gx, gy);
    const deaths = sampleBilinear(rawGrids.deathsRaw, GRID_RES, GRID_RES, gx, gy);
    const allKills = baselineGrids ? sampleBilinear(baselineGrids.killsRaw, GRID_RES, GRID_RES, gx, gy) : undefined;
    if (kills < 0.5 && deaths < 0.5 && (allKills ?? 0) < 0.5) return null;
    return {
      kills: Math.round(kills),
      deaths: Math.round(deaths),
      allKills: allKills === undefined ? undefined : Math.round(allKills),
    };
  }, [probe.point, rawGrids, baselineGrids, prompt]);
  const share = reading?.allKills
    ? `${((Math.min(reading.kills, reading.allKills) / reading.allKills) * 100).toFixed(1)}%`
    : null;
  const kd =
    reading && reading.allKills === undefined && reading.deaths > 0
      ? (reading.kills / reading.deaths).toFixed(2)
      : null;
  const announce = reading
    ? [
        `${reading.kills.toLocaleString("en-US")} kills`,
        `${reading.deaths.toLocaleString("en-US")} deaths`,
        kd && `K/D ${kd}`,
        reading.allKills !== undefined && `${reading.allKills.toLocaleString("en-US")} by all heroes`,
        share && `share ${share}`,
      ]
        .filter(Boolean)
        .join(", ")
    : "No kills or deaths here";

  return (
    // On a phone the map fills the width, so the legend and the slider leave it (above and below) instead of
    // covering its top and its bottom lane.
    <ChartStageFrame fit="square">
      <ChartOverlay position="top-end" narrow="outside">
        <HeatmapLegend viewMode={viewMode} maxValue={legendMax} sensitivity={sensitivity} />
      </ChartOverlay>
      {/* The tooltip sits outside the stage, which clips what leaves it. */}
      <div ref={containerRef} className="relative min-w-0">
        <ChartStage className="flex items-center justify-center">
          {/* No area until the first draw sizes them (the style never changes, so React leaves the drawn size alone):
            at the browser's default 300×150 they would jump across the stage when sized. */}
          <canvas ref={mapCanvasRef} aria-hidden="true" className="absolute" style={UNSIZED} />
          {/* The heat layer stands for the whole map: named, and described by the sentence under it. */}
          <canvas
            ref={heatCanvasRef}
            {...probe.targetProps}
            // The drawn map, named and described by the sentence under it; focusable, so the arrow keys step a probe
            // over it. Browsers expose a named canvas as an image, so it takes no role of its own.
            aria-label={heatmapName(viewMode, scope)}
            aria-describedby={summaryId}
            className={cn("absolute", probe.targetProps.className)}
            style={UNSIZED}
          />
          <p id={summaryId} className="sr-only">
            {prompt ?? summary}
          </p>
          {prompt && (
            <ChartOverlay position="center">
              <ChartOverlayItem>{prompt}</ChartOverlayItem>
            </ChartOverlay>
          )}
          {mapImages === "loading" && (
            <LoadingState size="sm" text="Loading map…" label="map" className="absolute inset-0" />
          )}
          {mapImages === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <ErrorState
                title="The map images did not load"
                description="The heatmap needs the map to draw on. Check your connection and try again."
                onRetry={() => {
                  setMapImages("loading");
                  setMapAttempt((n) => n + 1);
                }}
              />
            </div>
          )}
        </ChartStage>
        <ChartProbeCard point={probe.point} announce={announce}>
          {reading && (
            <TooltipStats variant="plain">
              <TooltipStat label="Kills" value={reading.kills.toLocaleString("en-US")} className="text-negative" />
              <TooltipStat label="Deaths" value={reading.deaths.toLocaleString("en-US")} className="text-info" />
              {kd && <TooltipStat label="K/D" value={kd} />}
              {reading.allKills !== undefined && (
                <TooltipStat label="All heroes" value={reading.allKills.toLocaleString("en-US")} />
              )}
              {share && <TooltipStat label="Share" value={share} />}
            </TooltipStats>
          )}
        </ChartProbeCard>
      </div>
      <ChartOverlay position="bottom-start" narrow="outside" layout="rows">
        {/* The share view's scale is fixed, so there is nothing to clip. */}
        <SensitivitySlider value={sensitivity} onChange={onSensitivityChange} disabled={viewMode === "share"} />
      </ChartOverlay>
    </ChartStageFrame>
  );
}
