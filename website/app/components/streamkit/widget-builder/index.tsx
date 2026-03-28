import { useQuery } from "@tanstack/react-query";
import { useId, useReducer } from "react";
import { useSearchParams } from "react-router";

import { CopyButton } from "~/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { CACHE_DURATIONS } from "~/constants/cache";
import { DEFAULT_LABELS, DEFAULT_VARIABLES } from "~/constants/streamkit/widget";
import { API_ORIGIN } from "~/lib/constants";
import { queryKeys } from "~/queries/query-keys";
import type { Color } from "~/types/general";
import type { Variable } from "~/types/streamkit/command";
import type { Theme } from "~/types/streamkit/widget";

import { BoxWidgetConfig } from "./BoxWidgetConfig";
import { RawWidgetConfig } from "./RawWidgetConfig";
import type { PreviewBackgroundColor } from "./widget-config";
import { themes, widgetConfigReducer, widgetTypes } from "./widget-config";
import { buildWidgetPreview } from "./widget-preview";
import { buildWidgetUrl } from "./widget-url";

interface WidgetBuilderProps {
  region: string;
  accountId: string;
}

export function WidgetBuilder({ region, accountId }: WidgetBuilderProps) {
  const [searchParams] = useSearchParams();

  const [config, updateConfig] = useReducer(widgetConfigReducer, {
    widgetType: searchParams.get("widget-type") ?? widgetTypes[0],
    theme: "dark" as Theme,
    variables: DEFAULT_VARIABLES,
    variable: "wins_losses_today",
    prefix: "Score: ",
    suffix: "",
    fontColor: "#ffffff" as Color,
    labels: DEFAULT_LABELS,
    extraArgs: {},
    showHeader: true,
    showBranding: true,
    showMatchHistory: true,
    matchHistoryShowsToday: false,
    numMatches: 10,
    opacity: 100,
    previewBackgroundImage: true,
    previewBackgroundColor: "#f3f4f6" as PreviewBackgroundColor,
  });

  const previewBgImageId = useId();

  const { data: availableVariables = [] } = useQuery<Variable[]>({
    queryKey: queryKeys.streamkit.availableVariables(),
    queryFn: () => fetch(`${API_ORIGIN}/v1/commands/variables/available`).then((res) => res.json()),
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const widgetUrl = buildWidgetUrl(region, accountId, config);
  const widgetPreview = buildWidgetPreview(region, accountId, config);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Type</Label>
          <Select value={config.widgetType} onValueChange={(v) => updateConfig({ widgetType: v })}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {widgetTypes.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {config.widgetType === "box" && (
          <div>
            <Label>Theme</Label>
            <Select value={config.theme} onValueChange={(v) => updateConfig({ theme: v as Theme })}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themes.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {config.widgetType === "raw" && (
        <RawWidgetConfig config={config} updateConfig={updateConfig} availableVariables={availableVariables} />
      )}

      {config.widgetType === "box" && (
        <BoxWidgetConfig config={config} updateConfig={updateConfig} availableVariables={availableVariables} />
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Preview</h3>
        {widgetPreview && (
          <div
            className="flex items-center justify-center rounded-lg bg-cover p-4"
            style={
              config.previewBackgroundImage
                ? {
                    background: "url('/streamkit/deadlock-background.webp'), url('/streamkit/deadlock-background.png')",
                    backgroundSize: "cover",
                    backgroundRepeat: "no-repeat",
                  }
                : { backgroundColor: config.previewBackgroundColor }
            }
          >
            {widgetPreview}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id={previewBgImageId}
              checked={config.previewBackgroundImage}
              onCheckedChange={(checked) => updateConfig({ previewBackgroundImage: checked === true })}
            />
            <Label htmlFor={previewBgImageId}>Show Image</Label>
          </div>
          {!config.previewBackgroundImage && (
            <div className="flex items-center gap-2">
              <Label>Background Color</Label>
              <input
                type="color"
                disabled={config.previewBackgroundImage}
                value={config.previewBackgroundColor}
                onChange={(e) => updateConfig({ previewBackgroundColor: e.target.value as PreviewBackgroundColor })}
                className="h-8 w-8 rounded-md border border-input p-0"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="mb-2 block text-sm font-medium text-foreground">Generated URL</h3>
        {widgetUrl ? (
          <div className="relative mt-1">
            <div className="rounded-md border border-border bg-muted p-3 pr-24 text-sm break-all text-muted-foreground">
              {widgetUrl}
            </div>
            <CopyButton size="sm" text={widgetUrl} className="absolute top-1/2 right-2 -translate-y-1/2" />
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
            No URL available yet. Fill in the fields to generate a URL.
          </div>
        )}
        <Alert>
          <AlertTitle>OBS Setup Instructions</AlertTitle>
          <AlertDescription>
            <ol className="mt-1 list-inside list-decimal space-y-1">
              <li>Add a new browser source in OBS.</li>
              <li>Paste the generated URL into the URL field.</li>
              <li>Adjust the width and height to your liking.</li>
              <li>Tick the "Deactivate when not showing" box.</li>
              <li>Click "OK" to add the widget to your stream.</li>
            </ol>
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>OBS Version Warning</AlertTitle>
          <AlertDescription>
            Old OBS-Versions might cause issues. Please update to the latest version if you encounter any issues!
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
