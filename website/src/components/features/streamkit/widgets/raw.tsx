import { useQuery } from "@tanstack/react-query";
import { type FC } from "react";

import { Spinner } from "~/components/ui/spinner";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { cn } from "~/lib/utils";
import { streamkitStatsQueryOptions } from "~/queries/streamkit-queries";
import type { RawWidgetProps } from "~/types/streamkit/widget";

const EMPTY_EXTRA_ARGS: Record<string, string> = {};

/**
 * The raw value floats on the game video with no surface of its own, so it gets a halo in the opposite of its color:
 * dark around a light color, light around a dark one.
 */
function haloFor(color: string): string {
  const hex = /^#?([\da-f]{6})$/i.exec(color)?.[1];
  if (!hex) return "text-shadow-md text-shadow-black/80";
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 128;
  return light ? "text-shadow-md text-shadow-black/80" : "text-shadow-md text-shadow-white/80";
}

export const RawWidget: FC<RawWidgetProps> = ({
  region,
  accountId,
  variable,
  prefix = "",
  suffix = "",
  extraArgs = EMPTY_EXTRA_ARGS,
  fontColor,
  refreshInterval = UPDATE_INTERVAL_MS,
}) => {
  const { data, isLoading: statsLoading } = useQuery(
    streamkitStatsQueryOptions({ region, accountId, variables: [variable], extraArgs, refreshInterval }),
  );

  // A failed background refetch keeps the last value on stream; only a widget that never loaded shows nothing.
  const stat = data?.[variable] ?? null;

  return (
    <div>
      {statsLoading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="lg" style={{ color: fontColor }} />
        </div>
      ) : stat ? (
        <div className="flex w-fit items-center gap-2">
          <div className={cn("text-4xl font-bold", haloFor(fontColor))} style={{ color: fontColor }}>
            {variable.endsWith("img") ? (
              <img src={stat} alt={variable} className="h-20 rounded-full" />
            ) : (
              prefix + stat + suffix
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
