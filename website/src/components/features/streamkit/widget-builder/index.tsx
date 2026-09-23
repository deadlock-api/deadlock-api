import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useReducer } from "react";

import { UrlDisplay } from "~/components/features/streamkit/command/UrlDisplay";
import { Step, Steps } from "~/components/patterns/content/Steps";
import { Section } from "~/components/patterns/page/Section";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card } from "~/components/ui/card";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Inline, Stack } from "~/components/ui/stack";
import { CACHE_DURATIONS } from "~/constants/cache";
import { DEFAULT_LABELS, DEFAULT_SUBTEXTS, DEFAULT_VARIABLES } from "~/constants/streamkit/widget";
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
  const search = useSearch({ strict: false }) as { "widget-type"?: string };

  const [config, updateConfig] = useReducer(widgetConfigReducer, {
    widgetType: search["widget-type"] ?? widgetTypes[0],
    theme: "dark" as Theme,
    variables: DEFAULT_VARIABLES,
    variable: "wins_losses_today",
    prefix: "Score: ",
    suffix: "",
    // ds-allow color-literal: default of a viewer-chosen overlay color; a color input needs hex
    fontColor: "#ffffff" as Color,
    labels: DEFAULT_LABELS,
    subtexts: DEFAULT_SUBTEXTS,
    extraArgs: {},
    showHeader: true,
    showBranding: true,
    showOutline: true,
    showMatchHistory: true,
    matchHistoryShowsToday: false,
    numMatches: 10,
    opacity: 100,
    previewBackgroundImage: true,
    // ds-allow color-literal: default of the user-picked preview backdrop; a color input needs hex
    previewBackgroundColor: "#f3f4f6" as PreviewBackgroundColor,
  });

  const { data: availableVariables = [] } = useQuery<Variable[]>({
    queryKey: queryKeys.streamkit.availableVariables(),
    queryFn: () => fetch(`${API_ORIGIN}/v1/commands/variables/available`).then((res) => res.json()),
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  // Only the arguments the chosen variables take: a `hero_name` left from a removed variable stayed in the URL.
  const shownVariables = config.widgetType === "raw" ? [config.variable] : config.variables;
  const usedArgs = new Set(
    availableVariables.filter((v) => shownVariables.includes(v.name)).flatMap((v) => v.extra_args ?? []),
  );
  const widgetUrl = buildWidgetUrl(region, accountId, {
    ...config,
    extraArgs: Object.fromEntries(Object.entries(config.extraArgs).filter(([arg]) => usedArgs.has(arg))),
  });
  const widgetPreview = buildWidgetPreview(region, accountId, config);

  return (
    <Stack gap={6}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <Select value={config.widgetType} onValueChange={(v) => updateConfig({ widgetType: v })}>
            <SelectTrigger className="w-full">
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
        </Field>

        {config.widgetType === "box" && (
          <Field label="Theme">
            <Select value={config.theme} onValueChange={(v) => updateConfig({ theme: v as Theme })}>
              <SelectTrigger className="w-full">
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
          </Field>
        )}
      </div>

      {config.widgetType === "raw" && (
        <RawWidgetConfig config={config} updateConfig={updateConfig} availableVariables={availableVariables} />
      )}

      {config.widgetType === "box" && (
        <BoxWidgetConfig config={config} updateConfig={updateConfig} availableVariables={availableVariables} />
      )}

      <Section as="h3" size="sm" title="Preview" className="gap-2">
        {widgetPreview && (
          <Card
            tone="muted"
            size="flush"
            radius="lg"
            // A widget wider than the column scrolls instead of being clipped on both sides by the centring.
            className="items-center-safe justify-center overflow-x-auto p-4"
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
          </Card>
        )}

        <Inline gap={4} wrap="nowrap">
          <CheckboxField
            label="Show Image"
            checked={config.previewBackgroundImage}
            onCheckedChange={(checked) => updateConfig({ previewBackgroundImage: checked === true })}
          />
          {!config.previewBackgroundImage && (
            <Field label="Background Color" orientation="horizontal">
              <Input
                type="color"
                aria-label="Background Color"
                disabled={config.previewBackgroundImage}
                value={config.previewBackgroundColor}
                onChange={(e) => updateConfig({ previewBackgroundColor: e.target.value as PreviewBackgroundColor })}
              />
            </Field>
          )}
        </Inline>
      </Section>

      <Stack gap={2}>
        <UrlDisplay generatedUrl={widgetUrl ?? ""} />
        <Alert>
          <AlertTitle>OBS Setup Instructions</AlertTitle>
          <AlertDescription>
            <Steps variant="plain">
              <Step>Add a new browser source in OBS.</Step>
              <Step>Paste the generated URL into the URL field.</Step>
              <Step>Adjust the width and height to your liking.</Step>
              <Step>Tick the "Deactivate when not showing" box.</Step>
              <Step>Click "OK" to add the widget to your stream.</Step>
            </Steps>
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>OBS Version Warning</AlertTitle>
          <AlertDescription>
            Old OBS-Versions might cause issues. Please update to the latest version if you encounter any issues!
          </AlertDescription>
        </Alert>
      </Stack>
    </Stack>
  );
}
