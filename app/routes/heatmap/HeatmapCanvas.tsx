import type { MapV1 } from "assets_deadlock_api_client";
import type { KillDeathStats } from "deadlock_api_client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildHeatGrid, buildHeatGrids, COLOR_LUT, GRID_RES, sampleBilinear } from "./heatmap-grid";
import { SensitivitySlider } from "./SensitivitySlider";

type ViewMode = "kills" | "deaths" | "kd";

interface TooltipState {
  x: number;
  y: number;
  kills: number;
  deaths: number;
}

interface HeatmapCanvasProps {
  data: KillDeathStats[];
  mapData: MapV1;
  viewMode: ViewMode;
  sensitivity: number;
  onSensitivityChange: (value: number) => void;
}

export default function HeatmapCanvas({
  data,
  mapData,
  viewMode,
  sensitivity,
  onSensitivityChange,
}: HeatmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mapImagesLoaded, setMapImagesLoaded] = useState(false);
  const compositeRef = useRef<HTMLCanvasElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const radius = mapData.radius ?? 10752;

  const rawGrids = useMemo(() => (data.length > 0 ? buildHeatGrids(data, radius) : null), [data, radius]);

  useEffect(() => {
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.src = src;
      });

    Promise.all([
      loadImage(mapData.images.background),
      loadImage(mapData.images.mid),
      loadImage(mapData.images.frame),
    ]).then(([bg, mid, frame]) => {
      const size = Math.max(bg.naturalWidth, mid.naturalWidth, frame.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bg, 0, 0, size, size);
      ctx.drawImage(mid, 0, 0, size, size);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(frame, 0, 0, size, size);
      compositeRef.current = canvas;
      setMapImagesLoaded(true);
    });
  }, [mapData.images.background, mapData.images.mid, mapData.images.frame]);

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

    if (data.length === 0) return;

    const grid = buildHeatGrid(data, viewMode, radius, sensitivity);

    const imageData = heatCtx.createImageData(canvasWidth, canvasHeight);
    const pixels = imageData.data;

    for (let py = 0; py < canvasHeight; py++) {
      const gy = (py / canvasHeight) * (GRID_RES - 1);
      for (let px = 0; px < canvasWidth; px++) {
        const gx = (px / canvasWidth) * (GRID_RES - 1);

        const raw = sampleBilinear(grid, GRID_RES, GRID_RES, gx, gy);
        if (raw < 0.001) continue;

        const t = raw ** 0.45;
        const lutIdx = Math.min(255, Math.round(t * 255)) * 4;

        const off = (py * canvasWidth + px) * 4;
        pixels[off] = COLOR_LUT[lutIdx];
        pixels[off + 1] = COLOR_LUT[lutIdx + 1];
        pixels[off + 2] = COLOR_LUT[lutIdx + 2];
        pixels[off + 3] = COLOR_LUT[lutIdx + 3];
      }
    }

    heatCtx.putImageData(imageData, 0, 0);
  }, [data, radius, viewMode, mapImagesLoaded, sensitivity]);

  useEffect(() => {
    if (!mapImagesLoaded) return;
    renderHeatmap();

    const observer = new ResizeObserver(() => renderHeatmap());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapImagesLoaded, renderHeatmap]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!rawGrids) return;
      const canvas = heatCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const canvasRect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relX = (e.clientX - canvasRect.left) / canvasRect.width;
      const relY = (e.clientY - canvasRect.top) / canvasRect.height;

      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
        setTooltip(null);
        return;
      }

      const gx = relX * (GRID_RES - 1);
      const gy = relY * (GRID_RES - 1);

      const kills = sampleBilinear(rawGrids.killsRaw, GRID_RES, GRID_RES, gx, gy);
      const deaths = sampleBilinear(rawGrids.deathsRaw, GRID_RES, GRID_RES, gx, gy);

      if (kills < 0.5 && deaths < 0.5) {
        setTooltip(null);
        return;
      }

      setTooltip({
        x: e.clientX - containerRect.left + 12,
        y: e.clientY - containerRect.top - 10,
        kills: Math.round(kills),
        deaths: Math.round(deaths),
      });
    },
    [rawGrids],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      <canvas ref={mapCanvasRef} className="absolute rounded-lg" />
      <canvas
        ref={heatCanvasRef}
        className="absolute rounded-lg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {!mapImagesLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading map...</span>
        </div>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-white/10 bg-black/85 backdrop-blur-sm px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Kills</span>
              <span className="font-medium text-red-400">{tooltip.kills.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Deaths</span>
              <span className="font-medium text-blue-400">{tooltip.deaths.toLocaleString()}</span>
            </div>
            {tooltip.deaths > 0 && (
              <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-1">
                <span className="text-muted-foreground">K/D</span>
                <span className="font-medium text-foreground">{(tooltip.kills / tooltip.deaths).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 backdrop-blur-sm px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">Low</span>
        <div
          className="h-2.5 w-24 rounded-full"
          style={{
            background:
              "linear-gradient(to right, rgb(20,0,200), rgb(0,100,255), rgb(0,230,230), rgb(50,255,50), rgb(230,255,0), rgb(255,130,0), rgb(255,0,0))",
          }}
        />
        <span className="text-[10px] text-muted-foreground">High</span>
      </div>

      <SensitivitySlider value={sensitivity} onChange={onSensitivityChange} className="absolute bottom-3 left-3" />
    </div>
  );
}
