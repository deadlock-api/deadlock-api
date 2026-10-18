import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { cn, snakeToPretty } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

const NO_ERRORS: Readonly<Record<string, string>> = {};

interface ExtraArgumentFieldsProps extends Omit<React.ComponentProps<"div">, "onChange"> {
  /** The arguments the chosen Stream Kit variables take (`hero_name`, ...). Repeats are shown once. */
  args: readonly string[];
  values: Readonly<Record<string, string>>;
  onValueChange: (arg: string, value: string) => void;
  /** Per argument, what is wrong with it: "{hero_kd} needs a hero". */
  errors?: Readonly<Record<string, string>>;
}

/**
 * The extra arguments of Stream Kit variables, one labelled field each, as many to a row as fit at 14rem.
 * `hero_name` is picked from the heroes (the API wants the name as it spells it); any other argument is typed. Renders
 * nothing when there are no arguments.
 */
export function ExtraArgumentFields({
  args,
  values,
  onValueChange,
  errors = NO_ERRORS,
  className,
  ...props
}: ExtraArgumentFieldsProps) {
  const baseId = useId();
  const unique = [...new Set(args)];
  if (unique.length === 0) return null;

  return (
    <div
      data-slot="extra-argument-fields"
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3", className)}
      {...props}
    >
      {unique.map((arg) =>
        arg === "hero_name" ? (
          <HeroArgument
            key={arg}
            value={values[arg] ?? ""}
            onValueChange={(name) => onValueChange(arg, name)}
            error={errors[arg]}
          />
        ) : (
          <Field key={arg} label={snakeToPretty(arg)} htmlFor={`${baseId}-${arg}`} error={errors[arg]}>
            <Input
              id={`${baseId}-${arg}`}
              type="text"
              autoComplete="off"
              value={values[arg] ?? ""}
              onChange={(e) => onValueChange(arg, e.target.value)}
            />
          </Field>
        ),
      )}
    </div>
  );
}

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
  // The selector cell carries its own visible "Hero" label, so the Field's would only repeat it.
  return (
    <Field label="Hero" labelDisplay="hidden" error={error}>
      <HeroSelector
        value={heroId}
        onValueChange={(id) => onValueChange(heroes.find((hero) => hero.id === id)?.name ?? "")}
      />
    </Field>
  );
}
