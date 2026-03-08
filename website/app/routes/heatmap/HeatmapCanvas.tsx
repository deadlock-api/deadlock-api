import type { KillDeathStats } from "deadlock_api_client";
import type { MapV1 } from "assets_deadlock_api_client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildHeatGrid, sampleBilinear, COLOR_LUT, GRID_RES } from "./heatmap-grid";

type ViewMode = "kills" | "deaths";

interface HeatmapCanvasProps {
  data: KillDeathStats[];
  mapData: MapV1;
  viewMode: ViewMode;
}

export default function HeatmapCanvas({ data, mapData, viewMode }: HeatmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mapImageLoaded, setMapImageLoaded] = useState(false);
  const mapImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      mapImageRef.current = img;
      setMapImageLoaded(true);
    };
    img.src = "/map.png";
  }, []);

  const renderHeatmap = useCallback(() => {
    const mapCanvas = mapCanvasRef.current;
    const heatCanvas = heatCanvasRef.current;
    const img = mapImageRef.current;
    const container = containerRef.current;
    if (!mapCanvas || !heatCanvas || !img || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerRect = container.getBoundingClientRect();
    const aspectRatio = img.naturalWidth / img.naturalHeight;

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
      mapCtx.fillStyle = "#0a0e1a";
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
      mapCtx.fill();

      mapCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    }

    const heatCtx = heatCanvas.getContext("2d");
    if (!heatCtx) return;
    heatCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (data.length === 0) return;

    const radius = mapData.radius ?? 10752;
    const grid = buildHeatGrid(data, viewMode, radius);

    const imageData = heatCtx.createImageData(canvasWidth, canvasHeight);
    const pixels = imageData.data;

    for (let py = 0; py < canvasHeight; py++) {
      const gy = (py / canvasHeight) * (GRID_RES - 1);
      for (let px = 0; px < canvasWidth; px++) {
        const gx = (px / canvasWidth) * (GRID_RES - 1);

        const raw = sampleBilinear(grid, GRID_RES, GRID_RES, gx, gy);
        if (raw < 0.001) continue;

        const t = Math.pow(raw, 0.45);
        const lutIdx = Math.min(255, Math.round(t * 255)) * 4;

        const off = (py * canvasWidth + px) * 4;
        pixels[off] = COLOR_LUT[lutIdx];
        pixels[off + 1] = COLOR_LUT[lutIdx + 1];
        pixels[off + 2] = COLOR_LUT[lutIdx + 2];
        pixels[off + 3] = COLOR_LUT[lutIdx + 3];
      }
    }

    heatCtx.putImageData(imageData, 0, 0);
  }, [data, mapData.radius, viewMode, mapImageLoaded]);

  useEffect(() => {
    if (!mapImageLoaded) return;
    renderHeatmap();

    const observer = new ResizeObserver(() => renderHeatmap());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapImageLoaded, renderHeatmap]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      <canvas ref={mapCanvasRef} className="absolute rounded-lg" />
      <canvas ref={heatCanvasRef} className="absolute rounded-lg" />
      {!mapImageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading map...</span>
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
    </div>
  );
}
