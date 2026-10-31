import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { LabHeroPageProps, LabItemPageProps } from "./types";

export interface LabVariant {
  id: string;
  name: string;
  HeroPage: LazyExoticComponent<ComponentType<LabHeroPageProps>>;
  ItemPage: LazyExoticComponent<ComponentType<LabItemPageProps>>;
}

// Each variant owns `src/components/dev/lab/<id>/` and nothing else; a broken variant only breaks its own chunk.
// `import.meta.env.DEV` is replaced at build time, so production bundles none of the variants.
export const LAB_VARIANTS: readonly LabVariant[] = import.meta.env.DEV
  ? [
      {
        id: "dense",
        name: "Terminal",
        HeroPage: lazy(() => import("./dense/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./dense/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "editorial",
        name: "Editorial",
        HeroPage: lazy(() => import("./editorial/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./editorial/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "decision",
        name: "Decision",
        HeroPage: lazy(() => import("./decision/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./decision/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "relative",
        name: "Relative",
        HeroPage: lazy(() => import("./relative/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./relative/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "phases",
        name: "Phases",
        HeroPage: lazy(() => import("./phases/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./phases/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "visual",
        name: "Visual",
        HeroPage: lazy(() => import("./visual/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./visual/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "cockpit",
        name: "Cockpit",
        HeroPage: lazy(() => import("./cockpit/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./cockpit/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
      {
        id: "mobile",
        name: "Mobile first",
        HeroPage: lazy(() => import("./mobile/HeroPage").then((m) => ({ default: m.HeroPage }))),
        ItemPage: lazy(() => import("./mobile/ItemPage").then((m) => ({ default: m.ItemPage }))),
      },
    ]
  : [];

export function findLabVariant(id: string): LabVariant | undefined {
  return LAB_VARIANTS.find((variant) => variant.id === id);
}
