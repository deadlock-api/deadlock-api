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

  // A description list: each stat is a label (dt) and its value and second line (dd), read as pairs. The divider is
  // drawn by the group itself, as nothing but dt and dd may sit in a dl.
  return (
    <dl className="flex flex-nowrap items-stretch justify-center gap-[9px] p-1">
      {stats.map((stat, index) => (
        <StatDisplay
          // eslint-disable-next-line react/no-array-index-key -- stats can have duplicate variables, no natural unique key
          key={`${stat.variable}-${index}`}
          stat={stat}
          theme={theme}
          className={cn(
            index < stats.length - 1 &&
              "after:absolute after:inset-y-0 after:-end-[5px] after:w-px after:bg-gradient-to-b after:from-transparent after:to-transparent",
            index < stats.length - 1 && (theme === "light" ? "after:via-black/50" : "after:via-white/50"),
          )}
        />
      ))}
    </dl>
  );
};
