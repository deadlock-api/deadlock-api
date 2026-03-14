import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/lib/utils";

import { getTodayDate } from "../lib/seed";
import type { GameMode } from "../lib/types";

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
    <Link to={path} className="group block">
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97, transition: { duration: 0 } }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className={cn(
          "relative border bg-[#0d1117]/60 p-5 backdrop-blur-sm transition-colors duration-200",
          STATUS_STYLES[status],
        )}
      >
        {STATUS_LABELS[status] && (
          <span
            className={cn(
              "absolute top-3 right-3 font-mono text-[9px] font-bold tracking-widest uppercase",
              STATUS_COLORS[status],
            )}
          >
            {STATUS_LABELS[status]}
          </span>
        )}

        <div className="flex items-start gap-4">
          <div className="border border-muted-foreground/15 bg-black/30 p-2.5 transition-colors group-hover:border-primary/30">
            <Icon className="h-5 w-5 text-muted-foreground/60 transition-colors group-hover:text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-game text-sm tracking-wide uppercase">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/50">{description}</p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
