import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useReducer, useRef } from "react";

import { UrlDisplay } from "~/components/features/streamkit/command/UrlDisplay";
import { FitFrame } from "~/components/patterns/content/FitFrame";
import { Section } from "~/components/patterns/page/Section";
import { Card } from "~/components/ui/card";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Field } from "~/components/ui/field";
import { useElementSize } from "~/components/ui/hooks/use-element-size";
import { InlineStat } from "~/components/ui/inline-stat";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Inline, Stack } from "~/components/ui/stack";
import { DEFAULT_LABELS, DEFAULT_SUBTEXTS, DEFAULT_VARIABLES, WIDGET_SCALE } from "~/constants/streamkit/widget";
import { availableVariablesQueryOptions } from "~/queries/streamkit-queries";
import type { Theme } from "~/types/streamkit/widget";

import { BoxWidgetConfig } from "./BoxWidgetConfig";
import { RawWidgetConfig } from "./RawWidgetConfig";
import type { PreviewBackgroundColor } from "./widget-config";
import { themes, widgetConfigReducer, widgetRows, widgetTypes } from "./widget-config";
import { buildWidgetPreview } from "./widget-preview";
import { buildWidgetUrl } from "./widget-url";

interface WidgetBuilderProps {
  region: string;
  accountId: string;
}

export function WidgetBuilder({ region, accountId }: WidgetBuilderProps) {
  const search = useSearch({ strict: false }) as { "widget-type"?: string };
  const navigate = useNavigate();

  const [config, updateConfig] = useReducer(widgetConfigReducer, {
    widgetType: widgetTypes.find(({ value }) => value === search["widget-type"])?.value ?? widgetTypes[0].value,
    theme: "dark",
    rows: widgetRows(DEFAULT_VARIABLES, DEFAULT_LABELS, DEFAULT_SUBTEXTS),
    variable: "wins_losses_today",
    prefix: "Score: ",
    suffix: "",
    // ds-allow color-literal: default of a viewer-chosen overlay color; a color input needs hex
    fontColor: "#ffffff",
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
    previewBackgroundColor: "#f3f4f6",
  });

  const { data: availableVariables = [] } = useQuery(availableVariablesQueryOptions);

  // Only the arguments the chosen variables take: a `hero_name` left from a removed variable stayed in the URL.
  const shownVariables = config.widgetType === "raw" ? [config.variable] : config.rows.map((row) => row.variable);
  const usedArgs = new Set(
    availableVariables.filter((v) => shownVariables.includes(v.name)).flatMap((v) => v.extra_args ?? []),
  );
  // The preview renders exactly what the URL carries, so it never shows a stat or an argument OBS would not get.
  const widgetConfig = {
    ...config,
    extraArgs: Object.fromEntries(Object.entries(config.extraArgs).filter(([arg]) => usedArgs.has(arg))),
  };
  const widgetUrl = buildWidgetUrl(region, accountId, widgetConfig);
  const widgetPreview = buildWidgetPreview(region, accountId, widgetConfig);
  // The overlay page zooms the widget, so the OBS browser source has to be the preview's size times that zoom.
  const previewRef = useRef<HTMLDivElement>(null);
  const previewSize = useElementSize(previewRef, { box: "border", round: true });
  const sourceSize =
    previewSize.width > 0
      ? `${Math.ceil(previewSize.width * WIDGET_SCALE)} × ${Math.ceil(previewSize.height * WIDGET_SCALE)}`
      : null;

  return (
    // Two columns once the card has room: the settings, and beside them the preview and URL, which stay in view
    // while the settings scroll.
    <div className="@container">
      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-2">
        <Stack gap={6} className="min-w-0">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select
                value={config.widgetType}
                onValueChange={(v) => {
                  updateConfig({ widgetType: v });
                  // The type is kept in the page URL, so a reload or a shared link opens the same builder.
                  void navigate({
                    to: ".",
                    search: (prev) => ({ ...prev, "widget-type": v }),
                    replace: true,
                    resetScroll: false,
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {widgetTypes.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
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
        </Stack>
        <Stack gap={6} className="min-w-0 @4xl:sticky @4xl:top-4">
          <Section as="h3" size="sm" title="Preview" className="gap-2">
            {widgetPreview && (
              <Card
                tone="muted"
                size="flush"
                radius="lg"
                className="p-4"
                style={
                  config.previewBackgroundImage
                    ? {
                        background:
                          "url('/streamkit/deadlock-background.webp'), url('/streamkit/deadlock-background.png')",
                        backgroundSize: "cover",
                        backgroundRepeat: "no-repeat",
                      }
                    : { backgroundColor: config.previewBackgroundColor }
                }
              >
                {/* A widget wider than the column is shown whole, scaled down, rather than clipped or scrolled. */}
                <FitFrame>
                  <div ref={previewRef} className="flex w-fit">
                    {widgetPreview}
                  </div>
                </FitFrame>
              </Card>
            )}

            <Inline gap={4} justify="between">
              <Inline gap={4} wrap="nowrap">
                <CheckboxField
                  label="Show Image"
                  checked={config.previewBackgroundImage}
                  onCheckedChange={(checked) => updateConfig({ previewBackgroundImage: checked === true })}
                />
                {/* Disabled under the image rather than removed, so turning the image off moves nothing. */}
                <Field label="Background Color" orientation="horizontal">
                  <Input
                    type="color"
                    aria-label="Background Color"
                    disabled={config.previewBackgroundImage}
                    value={config.previewBackgroundColor}
                    onChange={(e) => updateConfig({ previewBackgroundColor: e.target.value as PreviewBackgroundColor })}
                  />
                </Field>
              </Inline>
              {sourceSize && <InlineStat value={sourceSize} label="OBS browser source" />}
            </Inline>
          </Section>

          <UrlDisplay generatedUrl={widgetUrl ?? ""} />
        </Stack>
      </div>
    </div>
  );
}
