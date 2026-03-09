import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import type { GameMode } from "../lib/types";
import { getTodayDate } from "../lib/seed";

interface GameCardProps {
	mode: GameMode;
	title: string;
	description: string;
	icon: LucideIcon;
	path: string;
}

function getDailyStatus(mode: GameMode): "untouched" | "won" | "lost" | "playing" {
	try {
		const raw = localStorage.getItem(`deadlockdle:${mode}:game`);
		if (!raw) return "untouched";
		const state = JSON.parse(raw);
		if (state.date !== getTodayDate()) return "untouched";
		return state.status;
	} catch {
		return "untouched";
	}
}

const STATUS_STYLES = {
	untouched: "border-muted-foreground/15 hover:border-primary/40",
	playing: "border-yellow-500/30 hover:border-yellow-500/50",
	won: "border-green-500/30 hover:border-green-500/50",
	lost: "border-primary/30 hover:border-primary/50",
} as const;

const STATUS_LABELS = {
	untouched: null,
	playing: "IN PROGRESS",
	won: "COMPLETED",
	lost: "FAILED",
} as const;

const STATUS_COLORS = {
	untouched: "",
	playing: "text-yellow-400",
	won: "text-green-400",
	lost: "text-primary",
} as const;

export function GameCard({ mode, title, description, icon: Icon, path }: GameCardProps) {
	const status = getDailyStatus(mode);

	return (
		<Link to={path} className="block group">
			<motion.div
				whileHover={{ y: -2 }}
				transition={{ duration: 0.15 }}
				className={cn(
					"relative border bg-[#0d1117]/60 backdrop-blur-sm p-5 transition-all duration-200",
					STATUS_STYLES[status],
				)}
			>
				{STATUS_LABELS[status] && (
					<span
						className={cn(
							"absolute top-3 right-3 text-[9px] font-mono font-bold uppercase tracking-widest",
							STATUS_COLORS[status],
						)}
					>
						{STATUS_LABELS[status]}
					</span>
				)}

				<div className="flex items-start gap-4">
					<div className="p-2.5 border border-muted-foreground/15 bg-black/30 group-hover:border-primary/30 transition-colors">
						<Icon className="w-5 h-5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
					</div>
					<div className="flex-1 min-w-0">
						<h3 className="font-bold text-sm uppercase tracking-wide">{title}</h3>
						<p className="text-xs text-muted-foreground/50 mt-1 leading-relaxed">{description}</p>
					</div>
				</div>
			</motion.div>
		</Link>
	);
}
