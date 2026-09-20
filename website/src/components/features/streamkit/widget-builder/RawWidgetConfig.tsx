import { useId } from "react";

import { ExtraArguments } from "~/components/features/streamkit/widgets/ExtraArguments";
import { ColorInput } from "~/components/ui/color-input";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import type { Color } from "~/types/general";
import type { Variable } from "~/types/streamkit/command";

import type { WidgetConfig, WidgetConfigAction } from "./widget-config";

interface RawWidgetConfigProps {
  config: WidgetConfig;
  updateConfig: (action: WidgetConfigAction) => void;
  availableVariables: Variable[];
}

export function RawWidgetConfig({ config, updateConfig, availableVariables }: RawWidgetConfigProps) {
  const prefixId = useId();
  const suffixId = useId();

  function updateExtraArg(arg: string, value: string) {
    updateConfig({ extraArgs: { ...config.extraArgs, [arg]: value } });
  }

  return (
    <>
      <div className="grid w-full grid-cols-2 items-center gap-4">
        <Field label="Variable">
          <Select value={config.variable} onValueChange={(v) => updateConfig({ variable: v })}>
            <SelectTrigger className="w-full">
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
        </Field>
        <Field label="Font Color">
          <ColorInput
            aria-label="Font Color"
            value={config.fontColor}
            onChange={(e) => updateConfig({ fontColor: e.target.value as Color })}
          />
        </Field>
      </div>
      <div className="grid w-full grid-cols-2 items-center gap-4">
        <Field label="Prefix" htmlFor={prefixId}>
          <Input
            id={prefixId}
            type="text"
            value={config.prefix}
            onChange={(e) => updateConfig({ prefix: e.target.value })}
          />
        </Field>
        <Field label="Suffix" htmlFor={suffixId}>
          <Input
            id={suffixId}
            type="text"
            value={config.suffix}
            onChange={(e) => updateConfig({ suffix: e.target.value })}
          />
        </Field>
      </div>
      <ExtraArguments
        extraArgs={availableVariables.filter((v) => config.variable === v.name).flatMap((v) => v.extra_args ?? [])}
        extraValues={config.extraArgs || {}}
        onChange={updateExtraArg}
      />
    </>
  );
}
