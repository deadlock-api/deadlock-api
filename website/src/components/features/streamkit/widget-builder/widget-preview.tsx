import type { ReactElement } from "react";

import { BoxWidget } from "~/components/features/streamkit/widgets/box";
import { RawWidget } from "~/components/features/streamkit/widgets/raw";
import { withoutEmptyVariables } from "~/lib/streamkit-list";
import type { Region } from "~/types/streamkit/widget";

import type { WidgetConfig } from "./widget-config";

export function buildWidgetPreview(region: string, accountId: string, config: WidgetConfig): ReactElement | null {
  if (!accountId || !region) return null;

  switch (config.widgetType) {
    case "box": {
      // The same columns the widget URL carries: an "Add Variable" left unpicked is dropped from both.
      const { variables, labels, subtexts } = withoutEmptyVariables(config);
      return (
        <BoxWidget
          region={region as Region}
          accountId={accountId}
          variables={variables}
          labels={labels}
          subtexts={subtexts}
          extraArgs={config.extraArgs}
          theme={config.theme}
          showHeader={config.showHeader}
          showBranding={config.showBranding}
          showOutline={config.showOutline}
          showMatchHistory={config.showMatchHistory}
          matchHistoryShowsToday={config.matchHistoryShowsToday}
          numMatches={config.numMatches}
          opacity={config.opacity}
        />
      );
    }
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
