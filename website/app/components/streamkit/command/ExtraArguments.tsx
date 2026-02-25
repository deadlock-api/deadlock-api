import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { snakeToPretty } from "~/lib/utils";

interface ExtraArgumentsProps {
  extraArgs: { [key: string]: string };
  usedArgs: string[];
  onExtraArgChange: (arg: string, value: string) => void;
}

export function ExtraArguments({ extraArgs, usedArgs, onExtraArgChange }: ExtraArgumentsProps) {
  if (usedArgs.length === 0) return null;

  return (
    <div>
      <h3 className="block text-sm font-medium text-foreground mb-2">Extra Arguments</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {usedArgs.map((arg) => (
          <div key={arg} className="flex items-center space-x-2">
            <Label className="text-muted-foreground">{snakeToPretty(arg)}</Label>
            <Input
              type="text"
              value={extraArgs[arg] || ""}
              onChange={(e) => onExtraArgChange(arg, e.target.value)}
              className="w-24 h-8"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
