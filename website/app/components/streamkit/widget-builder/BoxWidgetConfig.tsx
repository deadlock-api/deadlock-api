import { useId } from "react";

import { ExtraArguments } from "~/components/streamkit/widgets/ExtraArguments";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { snakeToPretty } from "~/lib/utils";
import type { Variable } from "~/types/streamkit/command";

import type { WidgetConfig, WidgetConfigAction } from "./widget-config";

interface BoxWidgetConfigProps {
  config: WidgetConfig;
  updateConfig: (action: WidgetConfigAction) => void;
  availableVariables: Variable[];
}

export function BoxWidgetConfig({ config, updateConfig, availableVariables }: BoxWidgetConfigProps) {
  const showHeaderId = useId();
  const showBrandingId = useId();
  const showMatchHistoryId = useId();
  const matchHistoryShowsTodayId = useId();

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

      {config.theme !== "glass" && (
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
    </>
  );
}
