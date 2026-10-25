import { useMemo } from "react";

import { MatchHistory } from "~/components/features/streamkit/widgets/MatchHistory";
import { DEFAULT_LABELS, DEFAULT_VARIABLES, UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { useMatchHistory } from "~/hooks/streamkit/useMatchHistory";
import { useStats } from "~/hooks/streamkit/useStats";
import { useWidgetTheme } from "~/hooks/streamkit/useWidgetTheme";
import { variableLabel } from "~/lib/streamkit-command";
import type { BoxWidgetProps, Stat } from "~/types/streamkit/widget";

import { BoxBranding } from "./BoxBranding";
import { BoxHeader } from "./BoxHeader";
import { BoxStats } from "./BoxStats";

const EMPTY_EXTRA_ARGS: Record<string, string> = {};
const EMPTY_SUBTEXTS: string[] = [];

const TEMPLATE_PLACEHOLDER = /\{(\w+)}/g;

const templateVariables = (templates: string[]): string[] =>
  templates.flatMap((template) => [...template.matchAll(TEMPLATE_PLACEHOLDER)].map(([, name]) => name));

const resolveTemplate = (template: string, stats: Record<string, string>): string =>
  template.replaceAll(TEMPLATE_PLACEHOLDER, (_, name: string) => stats[name] ?? "");

const createStatDisplays = (
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
    imageAlt: variable.endsWith("_img") ? stats[variable.slice(0, -"_img".length)] : undefined,
    label: displayLabels[index] || variableLabel(variable),
    subtext: subtexts[index] ? resolveTemplate(subtexts[index], stats) : undefined,
    opacity,
  }));
};

const calculateMatchesToShow = (
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
    // An image stat is named by its value in words: `rank` for `rank_img`.
    for (const v of variables) {
      const base = v.slice(0, -"_img".length);
      if (v.endsWith("_img") && !variables.includes(base)) vars.add(base);
    }
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

  const matchHistory = useMatchHistory({ accountId, numMatches: numMatchesToShow, enabled: showMatchHistory });
  const stripPending = (matchHistoryShowsToday && !stats) || matchHistory.loading;
  // The box joins the strip only while the strip is drawn: with no matches (none today yet, or the count failed) the
  // strip is gone and the box keeps its own top edge and rounding.
  const showStrip = showMatchHistory && (stripPending || matchHistory.entries.length > 0);

  const statDisplays = useMemo(() => {
    if (!stats) return [];
    return createStatDisplays(stats, variables, displayLabels, subtexts, opacity);
  }, [stats, variables, displayLabels, subtexts, opacity]);

  const shouldShowHeader = showHeader && stats?.steam_account_name;

  return (
    // A column whose width is the wider of the match strip and the stats: every match the URL asks for is shown, and
    // the box stretches under a strip longer than its stats.
    <div className="inline-flex flex-col" style={themeStyles.cssVariables}>
      {showStrip && (
        <MatchHistory theme={theme} entries={matchHistory.entries} pending={stripPending} opacity={opacity} />
      )}
      <div className={themeStyles.containerClasses(showStrip)}>
        {shouldShowHeader && (
          <BoxHeader
            userName={stats?.steam_account_name || ""}
            showMatchHistory={showStrip}
            themeClasses={themeStyles}
          />
        )}

        <div className="space-y-1 p-2">
          <BoxStats stats={statDisplays} theme={theme} loading={loading} />

          {showBranding && <BoxBranding themeClasses={themeStyles} />}
        </div>
      </div>
    </div>
  );
};
