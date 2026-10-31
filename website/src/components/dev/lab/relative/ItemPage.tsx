import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";

import type { LabItemPageProps } from "../types";

export function ItemPage({ itemName }: LabItemPageProps) {
  return (
    <PageShell density="content">
      <PageHeader title={`Relative: ${itemName}`} />
    </PageShell>
  );
}
