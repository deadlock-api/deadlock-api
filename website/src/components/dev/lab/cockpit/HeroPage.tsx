import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";

import type { LabHeroPageProps } from "../types";

export function HeroPage({ heroName }: LabHeroPageProps) {
  return (
    <PageShell density="content">
      <PageHeader title={`Cockpit: ${heroName}`} />
    </PageShell>
  );
}
