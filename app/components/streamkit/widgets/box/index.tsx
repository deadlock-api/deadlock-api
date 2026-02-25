import { useMemo } from "react";
import { MatchHistory } from "~/components/streamkit/widgets/MatchHistory";
import { DEFAULT_LABELS, DEFAULT_VARIABLES, UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { useStats } from "~/hooks/streamkit/useStats";
import { useWidgetTheme } from "~/hooks/streamkit/useWidgetTheme";
import { snakeToPretty } from "~/lib/utils";
import type { BoxWidgetProps, Stat } from "~/types/streamkit/widget";
import { BoxBranding } from "./BoxBranding";
import { BoxHeader } from "./BoxHeader";
import { BoxStats } from "./BoxStats";

export const createStatDisplays = (
  stats: Record<string, string> | null,
  variables: string[],
  displayLabels: string[],
  opacity = 100,
): Stat[] => {
  if (!stats) return [];

  return variables.map((variable, index) => ({
    variable,
    value: stats[variable],
    label: displayLabels[index] || snakeToPretty(variable),
    opacity,
  }));
};

export const calculateMatchesToShow = (
  numMatches: number,
  matchHistoryShowsToday: boolean,
  stats: Record<string, string> | null,
): number => {
  if (!matchHistoryShowsToday) return numMatches;

  return Number.parseInt(stats?.matches_today ?? "0", 10);
};

export const BoxWidget = ({
  region,
  accountId,
  variables = DEFAULT_VARIABLES,
  labels = DEFAULT_LABELS,
  extraArgs = {},
  theme = "dark",
  showHeader = true,
  refreshInterval = UPDATE_INTERVAL_MS,
  showBranding = true,
  showMatchHistory = false,
  matchHistoryShowsToday = true,
  numMatches = 10,
  opacity = 100,
}: BoxWidgetProps) => {
  const auxiliaryVariables = useMemo(() => {
    const vars: string[] = [];
    if (showHeader) vars.push("steam_account_name");
    if (matchHistoryShowsToday) vars.push("matches_today");
    return vars;
  }, [showHeader, matchHistoryShowsToday]);

  const displayLabels = useMemo(() => {
    for (const [key, value] of Object.entries(extraArgs)) {
      labels = labels?.map((label) => label.replaceAll(`{${key}}`, value));
    }
    return labels || variables.map((v) => v);
  }, [labels, variables, extraArgs]);

  const { stats, loading, refreshTrigger } = useStats({
    region,
    accountId,
    variables,
    auxiliaryVariables,
    extraArgs,
    refreshInterval,
  });

  const themeStyles = useWidgetTheme(theme, opacity);

  const numMatchesToShow = useMemo(() => {
    if (!stats) return 0;
    return calculateMatchesToShow(numMatches, matchHistoryShowsToday, stats);
  }, [numMatches, matchHistoryShowsToday, stats]);

  const statDisplays = useMemo(() => {
    if (!stats) return [];
    return createStatDisplays(stats, variables, displayLabels, opacity);
  }, [stats, variables, displayLabels, opacity]);

  const shouldShowHeader = showHeader && stats?.steam_account_name;

  return (
    <div className="inline-block" style={themeStyles.cssVariables}>
      {showMatchHistory && (
        <div className="flex">
          <div className="grow w-0 overflow-clip">
            <MatchHistory
              theme={theme}
              refresh={refreshTrigger}
              numMatches={numMatchesToShow}
              accountId={accountId}
              opacity={opacity}
            />
          </div>
        </div>
      )}
      <div className={themeStyles.containerClasses(showMatchHistory)}>
        {shouldShowHeader && (
          <BoxHeader
            userName={stats?.steam_account_name || ""}
            showMatchHistory={showMatchHistory}
            themeClasses={themeStyles}
          />
        )}

        <div className="p-2 w-fit space-y-1">
          <BoxStats stats={statDisplays} theme={theme} loading={loading} />

          {showBranding && <BoxBranding themeClasses={themeStyles} />}
        </div>
      </div>
    </div>
  );
};
