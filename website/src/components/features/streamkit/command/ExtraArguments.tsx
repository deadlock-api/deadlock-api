import { ExtraArgumentFields } from "~/components/domain/streamkit/ExtraArgumentFields";
import { Section } from "~/components/patterns/page/Section";

interface ExtraArgumentsProps {
  extraArgs: { [key: string]: string };
  usedArgs: string[];
  onExtraArgChange: (arg: string, value: string) => void;
  /** Per argument, what is wrong with it: "{hero_kd} needs a hero". */
  errors?: { [key: string]: string };
}

export function ExtraArguments({ extraArgs, usedArgs, onExtraArgChange, errors }: ExtraArgumentsProps) {
  if (usedArgs.length === 0) return null;

  return (
    <Section as="h3" size="sm" title="Extra Arguments" className="gap-2">
      <ExtraArgumentFields args={usedArgs} values={extraArgs} onValueChange={onExtraArgChange} errors={errors} />
    </Section>
  );
}
