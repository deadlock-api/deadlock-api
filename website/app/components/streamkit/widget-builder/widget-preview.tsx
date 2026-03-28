import type { ReactElement } from "react";

import { BoxWidget } from "~/components/streamkit/widgets/box";
import { RawWidget } from "~/components/streamkit/widgets/raw";
import type { Region } from "~/types/streamkit/widget";

import type { WidgetConfig } from "./widget-config";

export function buildWidgetPreview(region: string, accountId: string, config: WidgetConfig): ReactElement | null {
  if (!accountId || !region) return null;

  switch (config.widgetType) {
    case "box":
      return (
        <BoxWidget
          region={region as Region}
          accountId={accountId}
          variables={config.variables}
          labels={config.labels}
          extraArgs={config.extraArgs}
          theme={config.theme}
          showHeader={config.showHeader}
          showBranding={config.showBranding}
          showMatchHistory={config.showMatchHistory}
          matchHistoryShowsToday={config.matchHistoryShowsToday}
          numMatches={config.numMatches}
          opacity={config.opacity}
        />
      );
    case "raw":
      return (
        <RawWidget
          region={region as Region}
          accountId={accountId}
          variable={config.variable}
          fontColor={config.fontColor}
          extraArgs={config.extraArgs}
          prefix={config.prefix}
          suffix={config.suffix}
        />
      );
    default:
      return null;
  }
}
