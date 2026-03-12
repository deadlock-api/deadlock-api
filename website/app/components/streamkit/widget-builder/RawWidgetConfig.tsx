import { ExtraArguments } from "~/components/streamkit/widgets/ExtraArguments";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
  function updateExtraArg(arg: string, value: string) {
    updateConfig({ extraArgs: { ...config.extraArgs, [arg]: value } });
  }

  return (
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
  );
}
