import { Fragment } from "react";

import { StatDisplay } from "~/components/streamkit/widgets/StatDisplay";
import { cn } from "~/lib/utils";

import type { BoxStatsProps } from "./BoxStats.types";

export const BoxStats = ({ stats, theme, loading }: BoxStatsProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 animate-ping rounded-full border-2 border-blue-500/20" />
          <div className="absolute inset-[2px] animate-spin rounded-full border-2 border-transparent border-t-blue-500" />
        </div>
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-nowrap items-stretch gap-1 p-1">
      {/* eslint-disable react/no-array-index-key -- stats can have duplicate variables, no natural unique key */}
      {stats.map((stat, index) => (
        <Fragment key={`${stat.variable}-${index}`}>
          <StatDisplay stat={stat} theme={theme} />
          {index < stats.length - 1 && (
            <div
              className={cn(
                "w-px flex-1 bg-gradient-to-b from-transparent to-transparent",
                theme === "light" ? "via-black/50" : "via-white/50",
              )}
            />
          )}
        </Fragment>
      ))}
      {/* eslint-enable react/no-array-index-key */}
    </div>
  );
};
