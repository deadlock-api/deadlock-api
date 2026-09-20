import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { Heading } from "~/components/ui/heading";
import { Inline, Stack } from "~/components/ui/stack";
import { snakeToPretty } from "~/lib/utils";
import type { Variable } from "~/types/streamkit/command";

interface VariablesListProps {
  variables: Variable[];
  onVariableClick: (varName: string) => void;
}

const CATEGORY_SORT: Record<string, number> = {
  General: 0,
  Daily: 1,
  Leaderboard: 2,
  Overall: 3,
  Hero: 4,
  Item: 5,
  Miscellaneous: 6,
};

function sort_weight(category: string): number {
  return CATEGORY_SORT[category] ?? 99;
}

function groupBy<T>(xs: T[], callback: (item: T) => string): Record<string, T[]> {
  return xs.reduce(
    (rv, x) => {
      rv[callback(x)] = rv[callback(x)] || [];
      rv[callback(x)].push(x);
      return rv;
    },
    {} as Record<string, T[]>,
  );
}

export function VariablesList({ variables, onVariableClick }: VariablesListProps) {
  const groupedVariables = groupBy(variables, (item) => item.category || "Miscellaneous");
  return (
    <Section as="h3" size="sm" title="Available Variables" className="gap-2">
      <Stack gap={2}>
        {Object.entries(groupedVariables)
          .sort((a, b) => sort_weight(a[0]) - sort_weight(b[0]))
          .map(([category, items]) => (
            <Stack key={category} gap={2}>
              <Heading as="h4" className="text-muted-foreground">
                {category}
              </Heading>
              <Inline gap={1} className="ps-2">
                {items.map((variable) => (
                  <Button
                    key={variable.name}
                    variant="outline"
                    size="xs"
                    shape="pill"
                    onClick={() => onVariableClick(variable.name)}
                    title={variable.description}
                  >
                    {snakeToPretty(variable.name)}
                  </Button>
                ))}
              </Inline>
            </Stack>
          ))}
      </Stack>
    </Section>
  );
}
