import { StatDisplay } from "~/components/streamkit/widgets/StatDisplay";
import { cn } from "~/lib/utils";
import type { BoxStatsProps } from "./BoxStats.types";

export const BoxStats = ({ stats, theme, loading }: BoxStatsProps) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-4">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
          <div className="absolute inset-[2px] rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-nowrap gap-1 p-1 items-stretch">
      {stats.map((stat, index) => (
        <>
          <StatDisplay key={`${stat.variable}-${index}-display`} stat={stat} theme={theme} />
          {index < stats.length - 1 && (
            <div
              key={`${stat.variable}-${index}-divider`}
              className={cn(
                "w-px flex-1 bg-gradient-to-b from-transparent to-transparent",
                theme === "light" ? "via-black/50" : "via-white/50",
              )}
            />
          )}
        </>
      ))}
    </div>
  );
};
