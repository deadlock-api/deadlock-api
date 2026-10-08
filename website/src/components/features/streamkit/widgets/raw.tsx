import { useQuery } from "@tanstack/react-query";
import { type FC } from "react";

import { Spinner } from "~/components/ui/spinner";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { streamkitStatsQueryOptions } from "~/queries/streamkit-queries";
import type { RawWidgetProps } from "~/types/streamkit/widget";

const EMPTY_EXTRA_ARGS: Record<string, string> = {};

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
          <div className="text-4xl font-bold" style={{ color: fontColor }}>
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
