import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { LoadingState } from "~/components/patterns/states/LoadingState";

// `import.meta.env.DEV` is replaced at build time, so production never bundles the showcase chunk.
const Showcase = import.meta.env.DEV ? lazy(() => import("~/components/dev/design-system/Showcase")) : null;

export const Route = createFileRoute("/dev/design-system")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: "Design system" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: DesignSystemPage,
});

function DesignSystemPage() {
  if (!Showcase) return null;
  return (
    <Suspense fallback={<LoadingState label="design system" />}>
      <Showcase />
    </Suspense>
  );
}
