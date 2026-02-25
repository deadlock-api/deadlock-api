import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router";
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
import { DEFAULT_LABELS, DEFAULT_VARIABLES } from "~/constants/streamkit/widget";
import { snakeToPretty } from "~/lib/utils";
import type { Variable } from "~/types/streamkit/command";
import type { Color, Region, Theme } from "~/types/streamkit/widget";

const widgetTypes: string[] = ["box", "raw"];

interface WidgetBuilderProps {
  region: string;
  accountId: string;
}

type RGB = `rgb(${number}, ${number}, ${number})`;
type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;
type HEX = `#${string}`;
type PreviewBackgroundColor = RGB | RGBA | HEX;

export default function WidgetBuilder({ region, accountId }: WidgetBuilderProps) {
  const [searchParams] = useSearchParams();
  const [widgetType, setWidgetType] = useState<string>(searchParams.get("widget-type") ?? widgetTypes[0]);
  const [theme, setTheme] = useState<Theme>("dark");
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [widgetPreview, setWidgetPreview] = useState<ReactElement | null>(null);
  const [widgetPreviewBackgroundImage, setWidgetPreviewBackgroundImage] = useState<boolean>(true);
  const [widgetPreviewBackgroundColor, setWidgetPreviewBackgroundColor] = useState<PreviewBackgroundColor>("#f3f4f6");
  const [variables, setVariables] = useState<string[]>(DEFAULT_VARIABLES);
  const [variable, setVariable] = useState<string>("wins_losses_today");
  const [prefix, setPrefix] = useState<string>("Score: ");
  const [suffix, setSuffix] = useState<string>("");
  const [fontColor, setFontColor] = useState<Color>("#ffffff");
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS);
  const [extraArgs, setExtraArgs] = useState<{ [key: string]: string }>({});
  const [availableVariables, setAvailableVariables] = useState<Variable[]>([]);
  const [showHeader, setShowHeader] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [showMatchHistory, setShowMatchHistory] = useState(true);
  const [matchHistoryShowsToday, setMatchHistoryShowsToday] = useState(false);
  const [numMatches, setNumMatches] = useState(10);
  const [opacity, setOpacity] = useState(100);
  const showHeaderId = useId();
  const showBrandingId = useId();
  const showMatchHistoryId = useId();
  const matchHistoryShowsTodayId = useId();
  const previewBgImageId = useId();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (widgetUrl) {
      navigator.clipboard.writeText(widgetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [widgetUrl]);

  const { data, error } = useQuery<Variable[]>({
    queryKey: ["available-variables"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/commands/variables/available").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (data) setAvailableVariables(data);
    if (error) {
      setAvailableVariables([]);
      console.error(error);
    }
  }, [data, error]);

  useEffect(() => {
    if (!accountId || !region) return;

    const url = new URL(`${window.location.origin}/streamkit/widgets/${region}/${accountId}/${widgetType}`);
    for (const [arg, value] of Object.entries(extraArgs)) {
      if (value) url.searchParams.set(arg, value);
    }
    switch (widgetType) {
      case "box":
        if (variables.length > 0) url.searchParams.set("vars", variables.join(","));
        if (labels.length > 0) url.searchParams.set("labels", labels.join(","));
        url.searchParams.set("theme", theme);
        url.searchParams.set("showHeader", showHeader.toString());
        url.searchParams.set("showBranding", showBranding.toString());
        url.searchParams.set("showMatchHistory", showMatchHistory.toString());
        url.searchParams.set("matchHistoryShowsToday", matchHistoryShowsToday.toString());
        url.searchParams.set("numMatches", numMatches.toString());
        url.searchParams.set("opacity", opacity.toString());
        setWidgetUrl(url.toString());
        setWidgetPreview(
          <BoxWidget
            region={region as Region}
            accountId={accountId}
            variables={variables}
            labels={labels}
            extraArgs={extraArgs}
            theme={theme}
            showHeader={showHeader}
            showBranding={showBranding}
            showMatchHistory={showMatchHistory}
            matchHistoryShowsToday={matchHistoryShowsToday}
            numMatches={numMatches}
            opacity={opacity}
          />,
        );
        break;
      case "raw":
        url.searchParams.set("fontColor", fontColor);
        url.searchParams.set("variable", variable);
        url.searchParams.set("prefix", prefix);
        url.searchParams.set("suffix", suffix);
        setWidgetUrl(url.toString());
        setWidgetPreview(
          <RawWidget
            region={region as Region}
            accountId={accountId}
            variable={variable}
            fontColor={fontColor}
            extraArgs={extraArgs}
            prefix={prefix}
            suffix={suffix}
          />,
        );
        break;
      default:
        setWidgetPreview(null);
    }
  }, [
    region,
    accountId,
    widgetType,
    variables,
    variable,
    fontColor,
    labels,
    extraArgs,
    theme,
    showHeader,
    showBranding,
    matchHistoryShowsToday,
    showMatchHistory,
    numMatches,
    opacity,
    prefix,
    suffix,
  ]);

  const themes: { value: Theme; label: string }[] = [
    { value: "dark", label: "Dark Theme" },
    { value: "light", label: "Light Theme" },
    { value: "glass", label: "Glass Theme" },
  ];

  return (
    <div className="mt-4 space-y-6">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Type</Label>
            <Select value={widgetType} onValueChange={setWidgetType}>
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

          {widgetType === "box" && (
            <div>
              <Label>Theme</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
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
        {widgetType === "raw" && (
          <>
            <div className="grid grid-cols-2 items-center w-full gap-4">
              <div>
                <Label>Variable</Label>
                <Select value={variable} onValueChange={setVariable}>
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
                  value={fontColor}
                  onChange={(e) => setFontColor(e.target.value as Color)}
                  className="mt-1 block w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 shadow-xs cursor-pointer"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 items-center w-full gap-4">
              <div>
                <Label>Prefix</Label>
                <Input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Suffix</Label>
                <Input type="text" value={suffix} onChange={(e) => setSuffix(e.target.value)} className="mt-1" />
              </div>
            </div>
            <ExtraArguments
              extraArgs={availableVariables.filter((v) => variable === v.name).flatMap((v) => v.extra_args ?? [])}
              extraValues={extraArgs || {}}
              onChange={(arg, value) => setExtraArgs({ ...extraArgs, [arg]: value })}
            />
          </>
        )}
        {widgetType === "box" && (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={showHeaderId}
                  checked={showHeader}
                  onCheckedChange={(checked) => setShowHeader(checked === true)}
                />
                <Label htmlFor={showHeaderId}>Show Player Name Header</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={showBrandingId}
                  checked={showBranding}
                  onCheckedChange={(checked) => setShowBranding(checked === true)}
                />
                <Label htmlFor={showBrandingId}>Show Branding</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={showMatchHistoryId}
                  checked={showMatchHistory}
                  onCheckedChange={(checked) => setShowMatchHistory(checked === true)}
                />
                <Label htmlFor={showMatchHistoryId}>Show Recent Matches</Label>
              </div>
              <div className="ml-6 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={matchHistoryShowsTodayId}
                    checked={matchHistoryShowsToday}
                    disabled={!showMatchHistory}
                    onCheckedChange={(checked) => setMatchHistoryShowsToday(checked === true)}
                  />
                  <Label htmlFor={matchHistoryShowsTodayId}>Show Todays Matches</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    min={1}
                    max={20}
                    disabled={!showMatchHistory || matchHistoryShowsToday}
                    value={[numMatches]}
                    onValueChange={([v]) => setNumMatches(v)}
                    className="w-32"
                  />
                  <span className="text-sm font-medium text-foreground">{numMatches} Matches</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="block text-sm font-medium text-foreground mb-2">Variables and Labels</h3>
              <div className="space-y-3">
                {!variables ? (
                  <div className="flex justify-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {variables.map((variable, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: variable list uses index as key
                        <div key={index}>
                          <div className="flex gap-3">
                            <Select
                              value={variable}
                              onValueChange={(value) => {
                                const newVariables = [...variables];
                                newVariables[index] = value;
                                const newLabels = [...labels];
                                const availableVariable = availableVariables.find((v) => v.name === value);
                                newLabels[index] = value
                                  ? (availableVariable?.default_label ?? snakeToPretty(value))
                                  : "";

                                setVariables(newVariables);
                                setLabels(newLabels);
                              }}
                            >
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
                              value={labels[index]}
                              onChange={(e) => {
                                const newLabels = [...labels];
                                newLabels[index] = e.target.value;
                                setLabels(newLabels);
                              }}
                              className="w-1/2"
                              placeholder="Label (optional)"
                            />
                            <Button
                              variant="destructive"
                              onClick={() => {
                                setVariables(variables.filter((_, i) => i !== index));
                                setLabels(labels.filter((_, i) => i !== index));
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                      <ExtraArguments
                        extraArgs={availableVariables
                          .filter((v) => variables.includes(v.name))
                          .flatMap((v) => v.extra_args ?? [])}
                        extraValues={extraArgs || {}}
                        onChange={(arg, value) => setExtraArgs({ ...extraArgs, [arg]: value })}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        setVariables([...variables, ""]);
                        setLabels([...labels, ""]);
                      }}
                    >
                      Add Variable
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="space-y-6">
        {theme !== "glass" && widgetType === "box" && (
          <div>
            <Label>Background Opacity</Label>
            <div className="mt-1 flex items-center gap-2">
              <Slider min={0} max={100} value={[opacity]} onValueChange={([v]) => setOpacity(v)} className="w-full" />
              <span className="text-sm text-muted-foreground min-w-[3ch]">{opacity}%</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Preview</h3>
          {widgetPreview && (
            <div
              className="p-4 rounded-lg flex items-center justify-center bg-cover"
              style={
                widgetPreviewBackgroundImage
                  ? {
                      background:
                        "url('/streamkit/deadlock-background.webp'), url('/streamkit/deadlock-background.png')",
                      backgroundSize: "cover",
                      backgroundRepeat: "no-repeat",
                    }
                  : { backgroundColor: widgetPreviewBackgroundColor }
              }
            >
              {widgetPreview}
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id={previewBgImageId}
                checked={widgetPreviewBackgroundImage}
                onCheckedChange={(checked) => setWidgetPreviewBackgroundImage(checked === true)}
              />
              <Label htmlFor={previewBgImageId}>Show Image</Label>
            </div>
            {!widgetPreviewBackgroundImage && (
              <div className="flex items-center gap-2">
                <Label>Background Color</Label>
                <input
                  type="color"
                  disabled={widgetPreviewBackgroundImage}
                  value={widgetPreviewBackgroundColor}
                  onChange={(e) => setWidgetPreviewBackgroundColor(e.target.value as PreviewBackgroundColor)}
                  className="rounded-md border border-input w-8 h-8 p-0 cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="block text-sm font-medium text-foreground mb-2">Generated URL</h3>
          {widgetUrl ? (
            <div className="relative mt-1">
              <div className="break-all rounded-md border border-border bg-muted p-3 pr-24 text-sm text-muted-foreground">
                {widgetUrl}
              </div>
              <Button
                size="sm"
                onClick={handleCopy}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              No URL available yet. Fill in the fields to generate a URL.
            </div>
          )}
          <Alert>
            <AlertTitle>OBS Setup Instructions</AlertTitle>
            <AlertDescription>
              <ol className="list-decimal list-inside space-y-1 mt-1">
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
    </div>
  );
}
