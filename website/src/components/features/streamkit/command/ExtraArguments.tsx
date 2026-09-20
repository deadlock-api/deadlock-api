import { Section } from "~/components/patterns/page/Section";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { snakeToPretty } from "~/lib/utils";

interface ExtraArgumentsProps {
  extraArgs: { [key: string]: string };
  usedArgs: string[];
  onExtraArgChange: (arg: string, value: string) => void;
}

export function ExtraArguments({ extraArgs, usedArgs, onExtraArgChange }: ExtraArgumentsProps) {
  if (usedArgs.length === 0) return null;

  return (
    <Section as="h3" size="sm" title="Extra Arguments" className="gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {usedArgs.map((arg) => (
          <Field key={arg} label={snakeToPretty(arg)} orientation="horizontal" htmlFor={`extra-arg-${arg}`}>
            <Input
              id={`extra-arg-${arg}`}
              type="text"
              value={extraArgs[arg] || ""}
              onChange={(e) => onExtraArgChange(arg, e.target.value)}
              className="w-24"
            />
          </Field>
        ))}
      </div>
    </Section>
  );
}
