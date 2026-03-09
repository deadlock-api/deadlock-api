import { cn } from "~/lib/utils";

interface AttemptsIndicatorProps {
	total: number;
	used: number;
	status: "playing" | "won" | "lost";
}

export function AttemptsIndicator({ total, used, status }: AttemptsIndicatorProps) {
	return (
		<div className="flex items-center gap-1.5 font-mono text-xs tracking-widest uppercase">
			<span className="text-muted-foreground/50 mr-1">[</span>
			{Array.from({ length: total }, (_, i) => {
				const isUsed = i < used;
				const isCurrent = i === used && status === "playing";
				return (
					<div
						key={i}
						className={cn(
							"w-2.5 h-2.5 border transition-all duration-200",
							isUsed && status === "won" && i === used - 1
								? "bg-green-500 border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
								: isUsed
									? "bg-primary/80 border-primary/60"
									: isCurrent
										? "border-primary/80 animate-pulse"
										: "border-muted-foreground/20",
						)}
					/>
				);
			})}
			<span className="text-muted-foreground/50 ml-1">]</span>
			<span className="text-muted-foreground/40 ml-2">
				{status === "won" ? "SOLVED" : status === "lost" ? "FAILED" : `${total - used} LEFT`}
			</span>
		</div>
	);
}
