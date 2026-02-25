import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { snakeToPretty } from "~/lib/utils";

interface ExtraArgumentsProps {
  extraArgs: string[];
  extraValues: { [key: string]: string };
  onChange: (arg: string, value: string) => void;
}

export function ExtraArguments({ extraArgs, extraValues, onChange }: ExtraArgumentsProps) {
  if (!extraArgs || extraArgs.length === 0) return null;

  extraArgs = [...new Set(extraArgs)];

  return (
    <div className="ml-8 mt-2 space-y-2">
      {extraArgs.map((arg) => (
        <div key={arg} className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">{snakeToPretty(arg)}:</Label>
          <Input
            type="text"
            value={extraValues[arg] ?? ""}
            onChange={(e) => onChange(arg, e.target.value)}
            className="w-36 h-8 text-sm"
            placeholder={`Enter ${snakeToPretty(arg)}`}
          />
        </div>
      ))}
    </div>
  );
}
