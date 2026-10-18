import { Plus, X } from "lucide-react";

import { ExtraArgumentFields } from "~/components/domain/streamkit/ExtraArgumentFields";
import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Field } from "~/components/ui/field";
import { useFocusAfterChange } from "~/components/ui/hooks/use-focus-after-change";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { formatCountNoun } from "~/lib/format";
import { variableLabel } from "~/lib/streamkit-command";
import type { Variable } from "~/types/streamkit/command";

import { missingArgErrors, type WidgetConfig, type WidgetConfigAction, type WidgetRow } from "./widget-config";

interface BoxWidgetConfigProps {
  config: WidgetConfig;
  updateConfig: (action: WidgetConfigAction) => void;
  availableVariables: Variable[];
}

export function BoxWidgetConfig({ config, updateConfig, availableVariables }: BoxWidgetConfigProps) {
  const { rows } = config;
  // A removed row takes the focused Remove button with it: focus moves to the next row's, the previous one's, or Add.
  const { ref: rowsRef, focusAfterChange } = useFocusAfterChange(rows.map((row) => row.id).join());

  function updateRow(id: number, change: Partial<WidgetRow>) {
    updateConfig({ rows: rows.map((row) => (row.id === id ? { ...row, ...change } : row)) });
  }

  function updateVariable(id: number, value: string) {
    const availableVariable = availableVariables.find((v) => v.name === value);
    updateRow(id, { variable: value, label: value ? (availableVariable?.default_label ?? variableLabel(value)) : "" });
  }

  function removeVariable(index: number) {
    focusAfterChange([
      ...[rows[index + 1], rows[index - 1]].filter(Boolean).map((row) => `[data-remove-row="${row.id}"]`),
      "[data-add-row]",
    ]);
    updateConfig({ rows: rows.filter((_, i) => i !== index) });
  }

  function addVariable() {
    const id = Math.max(-1, ...rows.map((row) => row.id)) + 1;
    updateConfig({ rows: [...rows, { id, variable: "", label: "", subtext: "" }] });
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
              getValueText={(v) => formatCountNoun(v, "match", "matches")}
              className="w-32"
            />
            <Text variant="label" tone="default" className="font-medium">
              {formatCountNoun(config.numMatches, "Match", "Matches")}
            </Text>
          </Inline>
        </Stack>
      </Stack>

      <Section as="h3" size="sm" title="Variables and Labels" className="gap-2">
        {/* A container, so the variable and its label stack when the builder is narrow. */}
        <Stack ref={rowsRef} gap={3} className="@container">
          {rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 @md:gap-x-3">
              <div className="flex flex-col gap-2 @sm:flex-row @sm:gap-3">
                <Select value={row.variable} onValueChange={(value) => updateVariable(row.id, value)}>
                  <SelectTrigger className="w-full @sm:w-1/2" aria-label={`Variable ${index + 1}`}>
                    <SelectValue placeholder="Select a variable" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVariables.map((v) => (
                      <SelectItem key={v.name} value={v.name}>
                        {variableLabel(v.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  syntax="template"
                  value={row.label}
                  onChange={(e) => updateRow(row.id, { label: e.target.value })}
                  className="w-full @sm:w-1/2"
                  aria-label={`Label for variable ${index + 1}`}
                  placeholder="Label (optional)"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="self-start"
                data-remove-row={row.id}
                onClick={() => removeVariable(index)}
                aria-label={`Remove variable ${index + 1}`}
              >
                <X aria-hidden="true" />
              </Button>
              <Input
                type="text"
                syntax="template"
                value={row.subtext}
                onChange={(e) => updateRow(row.id, { subtext: e.target.value })}
                aria-label={`Second line for variable ${index + 1}`}
                placeholder="Second line (optional), e.g. {rank_progress}"
              />
            </div>
          ))}
          <ExtraArgumentFields
            args={availableVariables
              .filter((v) => rows.some((row) => row.variable === v.name))
              .flatMap((v) => v.extra_args ?? [])}
            values={config.extraArgs}
            onValueChange={updateExtraArg}
            errors={missingArgErrors(
              availableVariables.filter((v) => rows.some((row) => row.variable === v.name)),
              config.extraArgs,
            )}
          />
          <Button variant="outline" data-add-row onClick={addVariable} className="self-start">
            <Plus aria-hidden="true" />
            Add Variable
          </Button>
        </Stack>
      </Section>

      {/* Glass has no opacity: the field stays, disabled, so choosing it moves nothing below. */}
      <Field label="Background Opacity">
        <Inline wrap="nowrap">
          <Slider
            aria-label="Background opacity"
            min={0}
            max={100}
            disabled={config.theme === "glass"}
            value={[config.opacity]}
            onValueChange={([v]) => updateConfig({ opacity: v })}
            getValueText={(v) => `${v}%`}
            className="w-full"
          />
          <Text tone="muted" numeric="tabular" className="min-w-10">
            {config.opacity}%
          </Text>
        </Inline>
      </Field>
    </>
  );
}
