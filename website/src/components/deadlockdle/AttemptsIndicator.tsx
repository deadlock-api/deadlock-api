import { cn } from "~/lib/utils";

interface AttemptsIndicatorProps {
  total: number;
  used: number;
  status: "playing" | "won" | "lost";
}

export function AttemptsIndicator({ total, used, status }: AttemptsIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs tracking-widest uppercase">
      <span className="mr-1 text-muted-foreground/50">[</span>
      {Array.from({ length: total }, (_, i) => {
        const isUsed = i < used;
        const isCurrent = i === used && status === "playing";
        return (
          <div
            key={i}
            className={cn(
              "h-2.5 w-2.5 border transition-all duration-200",
              isUsed && status === "won" && i === used - 1
                ? "border-green-400 bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                : isUsed
                  ? "border-primary/60 bg-primary/80"
                  : isCurrent
                    ? "animate-pulse border-primary/80"
                    : "border-muted-foreground/20",
            )}
          />
        );
      })}
      <span className="ml-1 text-muted-foreground/50">]</span>
      <span className="ml-2 text-muted-foreground/40">
        {status === "won" ? "SOLVED" : status === "lost" ? "FAILED" : `${total - used} LEFT`}
      </span>
    </div>
  );
}
