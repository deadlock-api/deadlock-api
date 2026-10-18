import { Fragment } from "react";

import { StatDisplay } from "~/components/features/streamkit/widgets/StatDisplay";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

import type { BoxStatsProps } from "./BoxStats.types";

export const BoxStats = ({ stats, theme, loading }: BoxStatsProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="lg" label="Loading stats" className={theme === "light" ? "text-gray-900" : "text-white"} />
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-nowrap items-stretch justify-center gap-1 p-1">
      {stats.map((stat, index) => (
        // eslint-disable-next-line react/no-array-index-key -- stats can have duplicate variables, no natural unique key
        <Fragment key={`${stat.variable}-${index}`}>
          <StatDisplay stat={stat} theme={theme} />
          {index < stats.length - 1 && (
            <div
              className={cn(
                "w-px shrink-0 bg-gradient-to-b from-transparent to-transparent",
                theme === "light" ? "via-black/50" : "via-white/50",
              )}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
};
