import { ExtraArguments } from "~/components/features/streamkit/widgets/ExtraArguments";
import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { snakeToPretty } from "~/lib/utils";
import type { Variable } from "~/types/streamkit/command";

import type { WidgetConfig, WidgetConfigAction } from "./widget-config";

interface BoxWidgetConfigProps {
  config: WidgetConfig;
  updateConfig: (action: WidgetConfigAction) => void;
  availableVariables: Variable[];
}

export function BoxWidgetConfig({ config, updateConfig, availableVariables }: BoxWidgetConfigProps) {
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

  function updateSubtext(index: number, value: string) {
    const newSubtexts = [...config.subtexts];
    newSubtexts[index] = value;
    updateConfig({ subtexts: newSubtexts });
  }

  function removeVariable(index: number) {
    updateConfig({
      variables: config.variables.filter((_, i) => i !== index),
      labels: config.labels.filter((_, i) => i !== index),
      subtexts: config.subtexts.filter((_, i) => i !== index),
    });
  }

  function addVariable() {
    updateConfig({
      variables: [...config.variables, ""],
      labels: [...config.labels, ""],
      subtexts: [...config.subtexts, ""],
    });
  }

  function updateExtraArg(arg: string, value: string) {
    updateConfig({ extraArgs: { ...config.extraArgs, [arg]: value } });
  }

  return (
    <>
      <Stack gap={3}>
        <CheckboxField
          label="Show Player Name Header"
          checked={config.showHeader}
          onCheckedChange={(checked) => updateConfig({ showHeader: checked === true })}
        />

        <CheckboxField
          label="Show Branding"
          checked={config.showBranding}
          onCheckedChange={(checked) => updateConfig({ showBranding: checked === true })}
        />

        <CheckboxField
          label="Show Border & Shadow"
          checked={config.showOutline}
          onCheckedChange={(checked) => updateConfig({ showOutline: checked === true })}
        />

        <CheckboxField
          label="Show Recent Matches"
          checked={config.showMatchHistory}
          onCheckedChange={(checked) => updateConfig({ showMatchHistory: checked === true })}
        />
        <Stack gap={2} className="ps-6">
          <CheckboxField
            label="Show Todays Matches"
            checked={config.matchHistoryShowsToday}
            disabled={!config.showMatchHistory}
            onCheckedChange={(checked) => updateConfig({ matchHistoryShowsToday: checked === true })}
          />
          <Inline wrap="nowrap">
            <Slider
              aria-label="Number of matches shown"
              min={1}
              max={20}
              disabled={!config.showMatchHistory || config.matchHistoryShowsToday}
              value={[config.numMatches]}
              onValueChange={([v]) => updateConfig({ numMatches: v })}
              className="w-32"
            />
            <Text variant="label" tone="default" className="font-medium">
              {config.numMatches} Matches
            </Text>
          </Inline>
        </Stack>
      </Stack>

      <Section as="h3" size="sm" title="Variables and Labels" className="gap-2">
        <Stack gap={3}>
          {config.variables.map((variable, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: variables can be duplicated so there's no natural unique key; list is only appended/removed from end
            // eslint-disable-next-line react/no-array-index-key -- variables can be duplicated
            <div key={index} className="flex gap-3">
              <div className="flex grow flex-col gap-2">
                <div className="flex gap-3">
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
                </div>
                <Input
                  type="text"
                  value={config.subtexts[index] ?? ""}
                  onChange={(e) => updateSubtext(index, e.target.value)}
                  placeholder="Second line (optional), e.g. {rank_progress}"
                />
              </div>
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
          <Button onClick={addVariable} className="self-start">
            Add Variable
          </Button>
        </Stack>
      </Section>

      {config.theme !== "glass" && (
        <Field label="Background Opacity">
          <Inline wrap="nowrap">
            <Slider
              aria-label="Background opacity"
              min={0}
              max={100}
              value={[config.opacity]}
              onValueChange={([v]) => updateConfig({ opacity: v })}
              className="w-full"
            />
            <Text tone="muted" numeric="tabular" className="min-w-10">
              {config.opacity}%
            </Text>
          </Inline>
        </Field>
      )}
    </>
  );
}
