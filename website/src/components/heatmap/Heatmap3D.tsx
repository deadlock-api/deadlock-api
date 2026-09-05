import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { KillDeathStats, MapData } from "deadlock_api_client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { buildHeatGrids, GRID_RES, interpolateColor, normalizeHeatGrids, sampleBilinear } from "./heatmap-grid";
import { HeatmapLegend } from "./HeatmapLegend";
import { SensitivitySlider } from "./SensitivitySlider";

type ViewMode = "kills" | "deaths" | "kd";

interface Heatmap3DProps {
  data: KillDeathStats[];
  mapData: MapData;
  viewMode: ViewMode;
  sensitivity: number;
  onSensitivityChange: (value: number) => void;
}

const HEAT_THRESHOLD = 0.005;
const BAR_RES = 64;
const OPACITY_BANDS = 8;

interface BandData {
  matrices: THREE.Matrix4[];
  colorData: number[];
  bandT: number;
}

function HeatBarBand({
  matrices,
  colorData,
  count,
  opacity,
}: {
  matrices: THREE.Matrix4[];
  colorData: number[];
  count: number;
  opacity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      color.setRGB(colorData[i * 3], colorData[i * 3 + 1], colorData[i * 3 + 2]);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [count, matrices, colorData, invalidate]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} key={count} renderOrder={2}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial transparent opacity={opacity} roughness={0.3} metalness={0.15} />
    </instancedMesh>
  );
}

function HeatBars({ grid, opacity }: { grid: Float32Array; opacity: number }) {
  const bands = useMemo(() => {
    const heightScale = 1.8;
    const barW = 4 / BAR_RES;
    const gap = 0.88;

    const bandGroups: BandData[] = Array.from({ length: OPACITY_BANDS }, (_, i) => ({
      matrices: [],
      colorData: [],
      bandT: i / (OPACITY_BANDS - 1),
    }));

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    for (let iy = 0; iy < BAR_RES; iy++) {
      for (let ix = 0; ix < BAR_RES; ix++) {
        const gx = (ix / (BAR_RES - 1)) * (GRID_RES - 1);
        const gy = (iy / (BAR_RES - 1)) * (GRID_RES - 1);
        const raw = sampleBilinear(grid, GRID_RES, GRID_RES, gx, gy);

        if (raw < HEAT_THRESHOLD) continue;

        const t = raw ** 0.45;
        const height = Math.max(t * heightScale, 0.01);

        const x = (ix / (BAR_RES - 1)) * 4 - 2;
        const z = (iy / (BAR_RES - 1)) * 4 - 2;

        pos.set(x, height / 2, z);
        scl.set(barW * gap, height, barW * gap);

        const matrix = new THREE.Matrix4();
        matrix.compose(pos, quat, scl);

        const bandIdx = Math.min(OPACITY_BANDS - 1, Math.floor(t * OPACITY_BANDS));
        bandGroups[bandIdx].matrices.push(matrix);

        const [r, g, b] = interpolateColor(t);
        bandGroups[bandIdx].colorData.push(r / 255, g / 255, b / 255);
      }
    }

    return bandGroups.filter((b) => b.matrices.length > 0);
  }, [grid]);

  return (
    <>
      {bands.map((band) => (
        <HeatBarBand
          key={band.bandT}
          matrices={band.matrices}
          colorData={band.colorData}
          count={band.matrices.length}
          opacity={opacity * (0.3 + band.bandT * 0.7)}
        />
      ))}
    </>
  );
}

function MapPlane({ mapImages }: { mapImages: { background: string; frame: string; mid: string } }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let compositeTexture: THREE.CanvasTexture | undefined;
    const loader = new THREE.ImageLoader();
    const load = (url: string) => loader.loadAsync(url);

    const loadAll = async () => {
      const [bgImg, frameImg, midImg] = await Promise.all([
        load(mapImages.background),
        load(mapImages.frame),
        load(mapImages.mid),
      ]);
      if (cancelled) return;
      const size = bgImg.width;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bgImg, 0, 0, size, size);
      ctx.drawImage(midImg, 0, 0, size, size);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(frameImg, 0, 0, size, size);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      compositeTexture = tex;
      setTexture(tex);
    };
    void loadAll().catch((error) => {
      if (!cancelled) console.error("Failed to load heatmap images", error);
    });
    return () => {
      cancelled = true;
      compositeTexture?.dispose();
    };
  }, [mapImages.background, mapImages.frame, mapImages.mid]);

  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} renderOrder={1}>
      <circleGeometry args={[2, 128]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.1} />
    </mesh>
  );
}

function BasePlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <circleGeometry args={[2.2, 64]} />
      <meshBasicMaterial color="#0c1220" />
    </mesh>
  );
}

export default function Heatmap3D({ data, mapData, viewMode, sensitivity, onSensitivityChange }: Heatmap3DProps) {
  const radius = mapData.radius ?? 10752;
  const [opacity, setOpacity] = useState(0.85);
  const rawGrids = useMemo(() => (data.length > 0 ? buildHeatGrids(data, radius) : null), [data, radius]);

  const { grid, legendMax } = useMemo(() => {
    if (!rawGrids) return { grid: new Float32Array(GRID_RES * GRID_RES), legendMax: 0 };
    const result = normalizeHeatGrids(rawGrids, viewMode, sensitivity);
    return { grid: result.grid, legendMax: result.maxValue };
  }, [rawGrids, viewMode, sensitivity]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 3.5, 3.5], fov: 50, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#050810"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <directionalLight position={[-3, 5, -3]} intensity={0.3} />

        <BasePlane />
        <MapPlane mapImages={mapData.images} />
        <HeatBars grid={grid} opacity={opacity} />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={1.5}
          maxDistance={10}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0, 0]}
        />
      </Canvas>

      <HeatmapLegend viewMode={viewMode} maxValue={legendMax} />

      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-sm">
          <span className="text-[10px] whitespace-nowrap text-muted-foreground">Opacity</span>
          <input
            aria-label="Opacity"
            type="range"
            min={10}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="h-1 w-20 cursor-pointer accent-primary"
          />
          <span className="w-7 text-[10px] text-muted-foreground tabular-nums">{Math.round(opacity * 100)}%</span>
        </div>
        <SensitivitySlider value={sensitivity} onChange={onSensitivityChange} />
      </div>

      <div className="absolute top-3 left-3 text-[10px] text-muted-foreground/60">
        Drag to rotate · Scroll to zoom · Right-click to pan
      </div>
    </div>
  );
}
