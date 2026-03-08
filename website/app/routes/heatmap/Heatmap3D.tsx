import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { MapV1 } from "assets_deadlock_api_client";
import type { KillDeathStats } from "deadlock_api_client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { buildHeatGrid, GRID_RES, interpolateColor, sampleBilinear } from "./heatmap-grid";
import { SensitivitySlider } from "./SensitivitySlider";

type ViewMode = "kills" | "deaths" | "kd";

interface Heatmap3DProps {
  data: KillDeathStats[];
  mapData: MapV1;
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

/** Single opacity band — one InstancedMesh for a group of bars sharing the same opacity */
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
  }, [count, matrices, colorData]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} key={count} renderOrder={2}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial transparent opacity={opacity} roughness={0.3} metalness={0.15} />
    </instancedMesh>
  );
}

/** 3D bar chart — bars split into opacity bands, tallest=max opacity, shortest=30% of max */
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

/** Flat plane with the map texture at y=0 */
function MapPlane() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load("/map.png", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      setTexture(tex);
    });
  }, []);

  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} renderOrder={1}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.1} />
    </mesh>
  );
}

/** Dark circular base beneath the map */
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

  const grid = useMemo(() => {
    if (data.length === 0) return new Float32Array(GRID_RES * GRID_RES);
    return buildHeatGrid(data, viewMode, radius, sensitivity);
  }, [data, viewMode, radius, sensitivity]);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <Canvas camera={{ position: [0, 3.5, 3.5], fov: 50, near: 0.1, far: 100 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#050810"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <directionalLight position={[-3, 5, -3]} intensity={0.3} />

        <BasePlane />
        <MapPlane />
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

      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 backdrop-blur-sm px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Opacity</span>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="w-20 h-1 accent-primary cursor-pointer"
          />
          <span className="text-[10px] text-muted-foreground tabular-nums w-7">{Math.round(opacity * 100)}%</span>
        </div>
        <SensitivitySlider value={sensitivity} onChange={onSensitivityChange} />
      </div>

      <div className="absolute top-3 left-3 text-[10px] text-muted-foreground/60">
        Drag to rotate · Scroll to zoom · Right-click to pan
      </div>
    </div>
  );
}
