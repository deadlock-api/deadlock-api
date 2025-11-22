import type { MapV1 } from "assets-deadlock-api-client/api";
import type { KillDeathStats } from "deadlock-api-client";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock-api-client/api";
import { useEffect, useMemo, useRef, useState } from "react";
import MapImage from "~/components/assets/MapImage";

const COLORS = {
	kill: { r: 255, g: 60, b: 60 },
	death: { r: 60, g: 160, b: 255 },
};

export interface KillDeathHeatmapProps {
	killDeathStats: KillDeathStats[];
	map: MapV1;
	team: AnalyticsApiKillDeathStatsRequest["team"];
}

export default function KillDeathHeatmap({
	killDeathStats,
	map,
	team,
}: KillDeathHeatmapProps) {
	const [showKills, setShowKills] = useState(true);
	const [showDeaths, setShowDeaths] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const mapRadius = map.radius ?? 10752;

	const maxKills = useMemo(
		() =>
			Math.max(
				...killDeathStats
					.filter((s) => team === s.killer_team)
					.map((s) => s.kills),
			),
		[killDeathStats, team],
	);

	const maxDeaths = useMemo(
		() =>
			Math.max(
				...killDeathStats
					.filter((s) => team !== s.killer_team)
					.map((s) => s.deaths),
			),
		[killDeathStats, team],
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = "screen";

		const pointRadius = (250 / mapRadius) * canvas.width;

		for (const stat of killDeathStats) {
			const isKill = team === stat.killer_team;

			if (isKill && !showKills) continue;
			if (!isKill && !showDeaths) continue;

			const x = ((stat.position_x / mapRadius + 1) / 2) * canvas.width;
			const y = ((stat.position_y / mapRadius + 1) / 2) * canvas.height;

			const intensity = Math.pow(
				isKill ? stat.kills / maxKills : stat.deaths / maxDeaths,
				1.2,
			);
			if (intensity <= 0 || !isFinite(intensity)) continue;

			const color = isKill ? COLORS.kill : COLORS.death;

			// Create Radial Gradient
			const gradient = ctx.createRadialGradient(x, y, 0, x, y, pointRadius);

			gradient.addColorStop(
				0,
				`rgba(${color.r}, ${color.g}, ${color.b}, ${intensity} )`,
			);
			gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
			ctx.fill();
		}
	}, [
		killDeathStats,
		maxKills,
		maxDeaths,
		team,
		mapRadius,
		showKills,
		showDeaths,
	]);

	return (
		<div className="kill-death-heatmap w-full h-auto max-w-200 relative isolate pointer-events-none select-none">
			<MapImage map={map} className="w-full h-auto block" />

			<canvas
				ref={canvasRef}
				width={1000}
				height={1000}
				className="absolute inset-0 w-full h-full select-none pointer-events-none opacity-90 mix-blend-hard-light blur-sm"
			/>

			<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
				{/* Legend */}
				<div className="bg-black bg-opacity-50 text-white text-sm rounded-md px-4 py-2 flex items-center space-x-4">
					<div
						className="flex items-center space-x-2 cursor-pointer"
						onClick={() => setShowKills((prev) => !prev)}
						style={{ opacity: showKills ? 1 : 0.5 }}
					>
						<div
							className="w-6 h-6 rounded-full"
							style={{ backgroundColor: "rgba(255, 60, 60, 0.7)" }}
						></div>
						<span>Kills</span>
					</div>
					<div
						className="flex items-center space-x-2 cursor-pointer"
						onClick={() => setShowDeaths((prev) => !prev)}
						style={{ opacity: showDeaths ? 1 : 0.5 }}
					>
						<div
							className="w-6 h-6 rounded-full"
							style={{ backgroundColor: "rgba(60, 160, 255, 0.7)" }}
						></div>
						<span>Deaths</span>
					</div>
				</div>
			</div>
		</div>
	);
}
