import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useId, useReducer } from "react";
import { useSearchParams } from "react-router";

import { CopyButton } from "~/components/copy-button";
import { BoxWidget } from "~/components/streamkit/widgets/box";
import { ExtraArguments } from "~/components/streamkit/widgets/ExtraArguments";
import { RawWidget } from "~/components/streamkit/widgets/raw";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { CACHE_DURATIONS } from "~/constants/cache";
import { DEFAULT_LABELS, DEFAULT_VARIABLES } from "~/constants/streamkit/widget";
import { API_ORIGIN } from "~/lib/constants";
import { snakeToPretty } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";
import type { Color } from "~/types/general";
import type { Variable } from "~/types/streamkit/command";
import type { Region, Theme } from "~/types/streamkit/widget";

const widgetTypes: string[] = ["box", "raw"];

const themes: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark Theme" },
  { value: "light", label: "Light Theme" },
  { value: "glass", label: "Glass Theme" },
];

interface WidgetBuilderProps {
  region: string;
  accountId: string;
}

type PreviewBackgroundColor = Color;

interface WidgetConfig {
  widgetType: string;
  theme: Theme;
  variables: string[];
  variable: string;
  prefix: string;
  suffix: string;
  fontColor: Color;
  labels: string[];
  extraArgs: { [key: string]: string };
  showHeader: boolean;
  showBranding: boolean;
  showMatchHistory: boolean;
  matchHistoryShowsToday: boolean;
  numMatches: number;
  opacity: number;
  previewBackgroundImage: boolean;
  previewBackgroundColor: PreviewBackgroundColor;
}

type WidgetConfigAction = Partial<WidgetConfig>;

function widgetConfigReducer(state: WidgetConfig, action: WidgetConfigAction): WidgetConfig {
  return { ...state, ...action };
}

function buildWidgetUrl(region: string, accountId: string, config: WidgetConfig): string | null {
  if (!accountId || !region) return null;

  const url = new URL(`${window.location.origin}/streamkit/widgets/${region}/${accountId}/${config.widgetType}`);
  for (const [arg, value] of Object.entries(config.extraArgs)) {
    if (value) url.searchParams.set(arg, value);
  }
  switch (config.widgetType) {
    case "box":
      if (config.variables.length > 0) url.searchParams.set("vars", config.variables.join(","));
      if (config.labels.length > 0) url.searchParams.set("labels", config.labels.join(","));
      url.searchParams.set("theme", config.theme);
      url.searchParams.set("showHeader", config.showHeader.toString());
      url.searchParams.set("showBranding", config.showBranding.toString());
      url.searchParams.set("showMatchHistory", config.showMatchHistory.toString());
      url.searchParams.set("matchHistoryShowsToday", config.matchHistoryShowsToday.toString());
      url.searchParams.set("numMatches", config.numMatches.toString());
      url.searchParams.set("opacity", config.opacity.toString());
      return url.toString();
    case "raw":
      url.searchParams.set("fontColor", config.fontColor);
      url.searchParams.set("variable", config.variable);
      url.searchParams.set("prefix", config.prefix);
      url.searchParams.set("suffix", config.suffix);
      return url.toString();
    default:
      return null;
  }
}

function buildWidgetPreview(region: string, accountId: string, config: WidgetConfig): ReactElement | null {
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

  const showHeaderId = useId();
  const showBrandingId = useId();
  const showMatchHistoryId = useId();
  const matchHistoryShowsTodayId = useId();
  const previewBgImageId = useId();

  const { data: availableVariables = [] } = useQuery<Variable[]>({
    queryKey: queryKeys.streamkit.availableVariables(),
    queryFn: () => fetch(`${API_ORIGIN}/v1/commands/variables/available`).then((res) => res.json()),
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const widgetUrl = buildWidgetUrl(region, accountId, config);
  const widgetPreview = buildWidgetPreview(region, accountId, config);

  function updateVariable(index: number, value: string) {
    const newVariables = [...config.variables];
    newVariables[index] = value;
    const newLabels = [...config.labels];
    const availableVariable = availableVariables.find((v) => v.name === value);
    newLabels[index] = value ? (availableVariable?.default_label ?? snakeToPretty(value)) : "";
    updateConfig({ variables: newVariables, labels: newLabels });
  }

  function updateLabel(index: number, value: string) {
    const newLabels = [...config.labels];
    newLabels[index] = value;
    updateConfig({ labels: newLabels });
  }

  function removeVariable(index: number) {
    updateConfig({
      variables: config.variables.filter((_, i) => i !== index),
      labels: config.labels.filter((_, i) => i !== index),
    });
  }

  function addVariable() {
    updateConfig({
      variables: [...config.variables, ""],
      labels: [...config.labels, ""],
    });
  }

  function updateExtraArg(arg: string, value: string) {
    updateConfig({ extraArgs: { ...config.extraArgs, [arg]: value } });
  }

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
        <>
          <div className="grid w-full grid-cols-2 items-center gap-4">
            <div>
              <Label>Variable</Label>
              <Select value={config.variable} onValueChange={(v) => updateConfig({ variable: v })}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select a variable" />
                </SelectTrigger>
                <SelectContent>
                  {availableVariables.map((v) => (
                    <SelectItem key={v.name} value={v.name}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Font Color</Label>
              <input
                type="color"
                value={config.fontColor}
                onChange={(e) => updateConfig({ fontColor: e.target.value as Color })}
                className="mt-1 block h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 shadow-xs"
              />
            </div>
          </div>
          <div className="grid w-full grid-cols-2 items-center gap-4">
            <div>
              <Label>Prefix</Label>
              <Input
                type="text"
                value={config.prefix}
                onChange={(e) => updateConfig({ prefix: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Suffix</Label>
              <Input
                type="text"
                value={config.suffix}
                onChange={(e) => updateConfig({ suffix: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <ExtraArguments
            extraArgs={availableVariables.filter((v) => config.variable === v.name).flatMap((v) => v.extra_args ?? [])}
            extraValues={config.extraArgs || {}}
            onChange={updateExtraArg}
          />
        </>
      )}

      {config.widgetType === "box" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={showHeaderId}
                checked={config.showHeader}
                onCheckedChange={(checked) => updateConfig({ showHeader: checked === true })}
              />
              <Label htmlFor={showHeaderId}>Show Player Name Header</Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id={showBrandingId}
                checked={config.showBranding}
                onCheckedChange={(checked) => updateConfig({ showBranding: checked === true })}
              />
              <Label htmlFor={showBrandingId}>Show Branding</Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id={showMatchHistoryId}
                checked={config.showMatchHistory}
                onCheckedChange={(checked) => updateConfig({ showMatchHistory: checked === true })}
              />
              <Label htmlFor={showMatchHistoryId}>Show Recent Matches</Label>
            </div>
            <div className="ml-6 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={matchHistoryShowsTodayId}
                  checked={config.matchHistoryShowsToday}
                  disabled={!config.showMatchHistory}
                  onCheckedChange={(checked) => updateConfig({ matchHistoryShowsToday: checked === true })}
                />
                <Label htmlFor={matchHistoryShowsTodayId}>Show Todays Matches</Label>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  min={1}
                  max={20}
                  disabled={!config.showMatchHistory || config.matchHistoryShowsToday}
                  value={[config.numMatches]}
                  onValueChange={([v]) => updateConfig({ numMatches: v })}
                  className="w-32"
                />
                <span className="text-sm font-medium text-foreground">{config.numMatches} Matches</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 block text-sm font-medium text-foreground">Variables and Labels</h3>
            <div className="space-y-3">
              {config.variables.map((variable, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: variables can be duplicated so there's no natural unique key; list is only appended/removed from end
                // eslint-disable-next-line react/no-array-index-key -- variables can be duplicated
                <div key={index} className="flex gap-3">
                  <Select value={variable} onValueChange={(value) => updateVariable(index, value)}>
                    <SelectTrigger className="w-1/2">
                      <SelectValue placeholder="Select a variable" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVariables.map((v) => (
                        <SelectItem key={v.name} value={v.name}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="text"
                    value={config.labels[index]}
                    onChange={(e) => updateLabel(index, e.target.value)}
                    className="w-1/2"
                    placeholder="Label (optional)"
                  />
                  <Button variant="destructive" onClick={() => removeVariable(index)}>
                    Remove
                  </Button>
                </div>
              ))}
              <ExtraArguments
                extraArgs={availableVariables
                  .filter((v) => config.variables.includes(v.name))
                  .flatMap((v) => v.extra_args ?? [])}
                extraValues={config.extraArgs || {}}
                onChange={updateExtraArg}
              />
              <Button onClick={addVariable}>Add Variable</Button>
            </div>
          </div>
        </>
      )}

      {config.theme !== "glass" && config.widgetType === "box" && (
        <div>
          <Label>Background Opacity</Label>
          <div className="mt-1 flex items-center gap-2">
            <Slider
              min={0}
              max={100}
              value={[config.opacity]}
              onValueChange={([v]) => updateConfig({ opacity: v })}
              className="w-full"
            />
            <span className="min-w-[3ch] text-sm text-muted-foreground">{config.opacity}%</span>
          </div>
        </div>
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
