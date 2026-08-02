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

const EMPTY_EXTRA_ARGS: Record<string, string> = {};
const EMPTY_SUBTEXTS: string[] = [];

const TEMPLATE_PLACEHOLDER = /\{(\w+)}/g;

export const templateVariables = (templates: string[]): string[] =>
  templates.flatMap((template) => [...template.matchAll(TEMPLATE_PLACEHOLDER)].map(([, name]) => name));

const resolveTemplate = (template: string, stats: Record<string, string>): string =>
  template.replaceAll(TEMPLATE_PLACEHOLDER, (_, name: string) => stats[name] ?? "");

export const createStatDisplays = (
  stats: Record<string, string> | null,
  variables: string[],
  displayLabels: string[],
  subtexts: string[] = EMPTY_SUBTEXTS,
  opacity = 100,
): Stat[] => {
  if (!stats) return [];

  return variables.map((variable, index) => ({
    variable,
    value: stats[variable],
    label: displayLabels[index] || snakeToPretty(variable),
    subtext: subtexts[index] ? resolveTemplate(subtexts[index], stats) : undefined,
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
  subtexts = EMPTY_SUBTEXTS,
  extraArgs = EMPTY_EXTRA_ARGS,
  theme = "dark",
  showHeader = true,
  refreshInterval = UPDATE_INTERVAL_MS,
  showBranding = true,
  showOutline = true,
  showMatchHistory = false,
  matchHistoryShowsToday = true,
  numMatches = 10,
  opacity = 100,
}: BoxWidgetProps) => {
  const auxiliaryVariables = useMemo(() => {
    const vars = new Set(templateVariables(subtexts).filter((v) => !variables.includes(v)));
    if (showHeader) vars.add("steam_account_name");
    if (matchHistoryShowsToday) vars.add("matches_today");
    return [...vars];
  }, [showHeader, matchHistoryShowsToday, subtexts, variables]);

  const displayLabels = useMemo(() => {
    let resolvedLabels = labels;
    for (const [key, value] of Object.entries(extraArgs)) {
      resolvedLabels = resolvedLabels?.map((label) => label.replaceAll(`{${key}}`, value));
    }
    return resolvedLabels || variables.map((v) => v);
  }, [labels, variables, extraArgs]);

  const { stats, loading } = useStats({
    region,
    accountId,
    variables,
    auxiliaryVariables,
    extraArgs,
    refreshInterval,
  });

  const themeStyles = useWidgetTheme(theme, opacity, showOutline);

  const numMatchesToShow = useMemo(() => {
    if (!stats) return 0;
    return calculateMatchesToShow(numMatches, matchHistoryShowsToday, stats);
  }, [numMatches, matchHistoryShowsToday, stats]);

  const statDisplays = useMemo(() => {
    if (!stats) return [];
    return createStatDisplays(stats, variables, displayLabels, subtexts, opacity);
  }, [stats, variables, displayLabels, subtexts, opacity]);

  const shouldShowHeader = showHeader && stats?.steam_account_name;

  return (
    <div className="inline-block" style={themeStyles.cssVariables}>
      {showMatchHistory && (
        <div className="flex">
          <div className="w-0 grow overflow-clip">
            <MatchHistory theme={theme} numMatches={numMatchesToShow} accountId={accountId} opacity={opacity} />
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

        <div className="w-fit space-y-1 p-2">
          <BoxStats stats={statDisplays} theme={theme} loading={loading} />

          {showBranding && <BoxBranding themeClasses={themeStyles} />}
        </div>
      </div>
    </div>
  );
};
