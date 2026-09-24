import { useQuery } from "@tanstack/react-query";

import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { Section } from "~/components/patterns/page/Section";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { snakeToPretty } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

interface ExtraArgumentsProps {
  extraArgs: { [key: string]: string };
  usedArgs: string[];
  onExtraArgChange: (arg: string, value: string) => void;
  /** Per argument, what is wrong with it: "{hero_kd} needs a hero". */
  errors?: { [key: string]: string };
}

const NO_ERRORS: { [key: string]: string } = {};

export function ExtraArguments({ extraArgs, usedArgs, onExtraArgChange, errors = NO_ERRORS }: ExtraArgumentsProps) {
  if (usedArgs.length === 0) return null;

  return (
    <Section as="h3" size="sm" title="Extra Arguments" className="gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {usedArgs.map((arg) =>
          arg === "hero_name" ? (
            <HeroArgument
              key={arg}
              value={extraArgs[arg] ?? ""}
              onValueChange={(name) => onExtraArgChange(arg, name)}
              error={errors[arg]}
            />
          ) : (
            <Field key={arg} label={snakeToPretty(arg)} htmlFor={`extra-arg-${arg}`} error={errors[arg]}>
              <Input
                id={`extra-arg-${arg}`}
                type="text"
                value={extraArgs[arg] ?? ""}
                onChange={(e) => onExtraArgChange(arg, e.target.value)}
              />
            </Field>
          ),
        )}
      </div>
    </Section>
  );
}

/** `hero_name` is a hero's name as the API spells it, so it is picked from the heroes instead of typed. */
function HeroArgument({
  value,
  onValueChange,
  error,
}: {
  value: string;
  onValueChange: (name: string) => void;
  error?: string;
}) {
  const { data: heroes = [] } = useQuery(heroesQueryOptions);
  const heroId = heroes.find((hero) => hero.name.toLowerCase() === value.toLowerCase())?.id ?? null;
  return (
    <Field label="Hero" labelDisplay="hidden" error={error}>
      <HeroSelector
        value={heroId}
        onValueChange={(id) => onValueChange(heroes.find((hero) => hero.id === id)?.name ?? "")}
      />
    </Field>
  );
}
